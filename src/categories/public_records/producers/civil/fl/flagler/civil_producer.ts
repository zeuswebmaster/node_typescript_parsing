import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';


export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://apps.flaglerclerk.com/Landmark/home/index'
    }

    xpaths = {
        isPageLoaded: '//a[contains(@onclick, "searchCriteriaDocuments")]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }
    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            this.browserPages.generalInfoPage?.setDefaultTimeout(150000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }    
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            try {
                const [docBtnHandle] = await page.$x('//a[contains(@onclick, "searchCriteriaDocuments")]');
                await docBtnHandle.click();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Flagler', 'Florida', countRecords, 'Civil & Lien');
                return false;
            }
            
            // accept condition
            let tosSubmit = await page.$x('//a[@id="idAcceptYes"]');
            if (tosSubmit.length > 0) {
                await Promise.all([tosSubmit[0].click(),
                    page.waitForNavigation()
                ]);
            }

            // setting doc type list
            const [doc_type_select_button] = await page.$x('//a[@id="documentTypeSelection-DocumentType"]');
            await doc_type_select_button.click();
            await page.waitForXPath('//h3[text()="Document Types"]');
            let documentTypes = ['Deeds', 'Lis Pendens', 'Marriage', 'Mortgages', 'Probate'];
            for (const docTypeSelect of documentTypes) {
                console.log(docTypeSelect);
                let option = (await page.$x('//select[@id="documentCategory-DocumentType"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('#documentCategory-DocumentType', optionVal);
                await this.sleep(200);
            }
            await page.waitFor(1000);
            
            // click done button
            const [select_button] = await page.$x('//form[@id="documentTypeSearchForm"]//a[contains(@onclick, "UpdateDocumentTypeListFromModal")]');
            await select_button.click();
            await page.waitFor(500);

            // setting date range
            const dateRange = await this.getDateRange('Florida', 'Flagler');
            await (await page.$x('//input[@id="beginDate-DocumentType"]'))[0].click({clickCount: 3});
            await (await page.$x('//input[@id="beginDate-DocumentType"]'))[0].press('Backspace');
            await (await page.$x('//input[@id="beginDate-DocumentType"]'))[0].type(this.getFormattedDate(dateRange.from), {delay: 150});
            await (await page.$x('//input[@id="endDate-DocumentType"]'))[0].click({clickCount: 3});
            await (await page.$x('//input[@id="endDate-DocumentType"]'))[0].press('Backspace');
            await (await page.$x('//input[@id="endDate-DocumentType"]'))[0].type(this.getFormattedDate(dateRange.to), {delay: 150});  
            
            await page.click('#submit-DocumentType');
            await page.waitForSelector('#resultsTable');
            console.log('table loaded');
            await page.waitFor(1000);

            const noResultHandle = await page.$x('//div[@id="resultsTable_info"]/b[contains(text(), "Returned 0 records")]');
            if (noResultHandle.length > 0) {
                console.log('Not Found');
                await AbstractProducer.sendMessage('Flagler', 'Florida', countRecords, 'Civil & Lien');
                return false;
            }
            
            let isLast = false;
            let pageNum = 0;

            while (!isLast) {
                try{
                    const tableXpath = `//table[@id="resultsTable"]/tbody/tr`;
                    const pageXpath = `//div[@id="resultsTable_paginate"]/span/a[contains(@data-dt-idx, "${pageNum + 2}")]`;
                    if (pageNum == 0) {
                        await page.waitForXPath(tableXpath);
                    } else {
                        await page.waitForXPath(pageXpath);
                    }

                    const results = await page.$x('//table[@id="resultsTable"]/tbody/tr');
                    for (const result of results) {
                        let names = await page.evaluate(el => el.children[6].innerHTML, result);
                        names = names.split(/<div.*<\/div>/);
                        let recordDate = await page.evaluate(el => el.children[7].textContent.trim(), result);
                        let docType = await page.evaluate(el => el.children[8].textContent.trim(), result);
                        let pageNum = await page.evaluate(el => el.children[11].textContent.trim(), result);
                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if(await this.getData(page, name, docType, recordDate, pageNum)){
                                countRecords++;
                            }
                        }
                    }

                    await page.waitFor(3000);
                    const nextButtonXpath = '//a[@id="resultsTable_next"]';
                    const [nextButtonEL] = await page.$x(nextButtonXpath);
                    if (nextButtonEL) {
                        const nextButtonClass = await nextButtonEL.evaluate(el => el.getAttribute('class'));
                        if (nextButtonClass == 'paginate_button next disabled') {
                            isLast = true;
                        } else {
                            pageNum++;
                            isLast = false;
                            await nextButtonEL.click();
                        }
                    } else {
                        isLast = true;
                    }
                    await this.randomSleepIn5Sec();
                } catch (e){
                    break;
                }
            }

            await AbstractProducer.sendMessage('Flagler', 'Florida', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('Flagler', 'Florida', countRecords, 'Civil & Lien');
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, pageNum: any): Promise<any> {
        const parseName: any = this.newParseName(name!.trim());
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': pageNum,
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return await this.civilAndLienSaveToNewSchema(data)
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}