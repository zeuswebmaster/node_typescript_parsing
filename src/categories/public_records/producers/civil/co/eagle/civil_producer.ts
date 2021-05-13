import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://acclaim.eaglecounty.us/AcclaimWeb/search/SearchTypeDocType'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnButton"]'
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
            const dateRange = await this.getDateRange('Colorado', 'Eagle');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateFix = this.getFormattedDate(fromDate);
            let toDateFix = this.getFormattedDate(toDate);

            try {
                await Promise.all([
                    page.$eval('input#btnButton', el => el.removeAttribute('disable')),
                    page.click('input#btnButton'),
                    page.waitForNavigation()
                ])
            } catch (error) {
                return false;
            }

            await this.sleep(3000);

            const showXpath = `//button[contains(text(), '...')]`;
            const typesXpath = '//div[@id="DocTypesWin"]';
            const listXpath = `//*[@id="DocTypelist"]/div/ul/li[2]`;

            const [showElement] = await page.$x(showXpath);
            await showElement.click();
            await page.waitForXPath(typesXpath);
            await (await page.$x(listXpath))[0].click();

            await page.waitForXPath('//div[@id="DocumentTypesList-2"]/div[1]');

            const docTypeSelects = ['DEED', 'LIEN', 'FORECLOSURE', 'MARRIAGE', 'MORTGAGE'];
            const items = await page.$x('//div[@id="DocumentTypesList-2"]/div[1]/input');

            for (let i = 0; i < items.length; i++) {
                const type = await items[i].evaluate(el => el.getAttribute('title'));
                if (type?.includes(docTypeSelects[0]) || type?.includes(docTypeSelects[1]) || type?.includes(docTypeSelects[2]) || type?.includes(docTypeSelects[3]) || type?.includes(docTypeSelects[4])) {
                    const [inputHandle] = await page.$x(`//div[@id="DocumentTypesList-2"]/div[1]/input[@title="${type}"]`);
                    await inputHandle.click();
                    await this.sleep(500);
                }
            }

            await (await page.$x(`//input[contains(@onclick, 'GetDocTypeString()')]`))[0].click();

            await this.sleep(3000);

            const fromDateHandle = await page.$('input#RecordDateFrom');
            const toDateHandle = await page.$('input#RecordDateTo');

            await fromDateHandle?.click({ clickCount: 3 });
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(fromDateFix, { delay: 150 });

            await toDateHandle?.click({ clickCount: 3 });
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(toDateFix, { delay: 150 });

            try {
                await Promise.all([
                    page.$eval('input#btnSearch', el => el.removeAttribute('disable')),
                    page.click('input#btnSearch'),
                ])
            } catch (error) {
                console.error(error);
                return false;
            }


            let pageNum = 0;
            let countPage = 1;

            while (pageNum >= 0) {
                const tableXpath = '//div[@class="t-grid-content"]/table/tbody';
                await page.waitForXPath(tableXpath);
                if (pageNum == 0) {
                    await this.sleep(10000);
                } else {
                    await this.sleep(3000);
                }
                const results = await page.$x(`${tableXpath}/tr`);

                for (let i = 0; i < results.length; i++) {
                    const [nameHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[3]`);
                    const [dateHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[8]`);
                    const [typeHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[5]`);

                    const name = await nameHandle.evaluate(el => el.textContent?.trim());
                    const date = await dateHandle.evaluate(el => el.textContent?.trim());
                    const type = await typeHandle.evaluate(el => el.textContent?.trim());

                    if (await this.getData(page, name, type, date))
                        countRecords++;
                }
                pageNum++;
                const nextButtonXpath = '//div[@id="RsltsGrid"]/div[2]/div[2]/a[3]';
                const [nextButtonEL] = await page.$x(nextButtonXpath);
                const nextButtonDisabled = await page.evaluate(el => el.getAttribute('class'), nextButtonEL);
                if (nextButtonDisabled === 't-link t-state-disabled') {
                    break;
                } else {
                    countPage++;
                    await nextButtonEL.click();
                }
            }
            await AbstractProducer.sendMessage('Eagle', 'Colorado', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('Eagle', 'Colorado', countRecords, 'Civil & Lien');
            return false;
        }


    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any): Promise<any> {
        const full_name = name.replace(/\n/g, '')
        const parseName: any = this.newParseName(full_name!.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            return false
        }

        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': 'CO',
            'County': 'Eagle',
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
        return (await this.civilAndLienSaveToNewSchema(data))
    }
}