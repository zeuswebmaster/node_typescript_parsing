import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://deeds.onslowcountync.gov/External/LandRecords/protected/v4/SrchName.aspx'
    }

    xpaths = {
        isPAloaded: '//html'
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'https://deeds.onslowcountync.gov/External/LandRecords/protected/v4/SrchName.aspx';
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;

        try {
            let dateRange = await this.getDateRange('North Carolina', 'Onslow');

            await page.goto(civilUrl, { timeout: 60000 });
            try {
                await page.waitForXPath('//input[@name="ctl00$btnEmergencyMessagesClose"]', { visible: true, timeout: 30000 });
                let signinAsGuest = await page.$x('//input[@name="ctl00$btnEmergencyMessagesClose"]');
                await signinAsGuest[0].click()
            } catch (err) {

            }


            await page.waitForXPath('//input[@name="ctl00$NavMenuIdxRec$btnNav_IdxRec_Date_NEW"]', { visible: true, timeout: 200000 });
            let searchByDateRange = await page.$x('//input[@name="ctl00$NavMenuIdxRec$btnNav_IdxRec_Date_NEW"]');
            await searchByDateRange[0].click()


            await page.waitForXPath('//input[@id="ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom"]', { visible: true, timeout: 200000 });
            // console.log(dateStringDay);
            await this.sleep(2000);
            let dateStringFrom = this.getFormattedDate(dateRange.from).replace(/\//g, "");
            let dateStringTo = this.getFormattedDate(dateRange.to).replace(/\//g, "");

            await page.click('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom', { clickCount: 3 });
            await page.type('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom', dateStringFrom);
            await page.click('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru', { clickCount: 3 });
            await page.type('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru', dateStringTo);

            const searchButton = await page.$x('//input[@id="ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_btnSearch"]');
            await searchButton[0].click()

            await page.waitForXPath('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr[2]/td', { visible: true, timeout: 200000 });

            let totalPages = await page.$x('//div[@class="NoPrint cott_paging"]/strong');
            let totalPagesUse = await totalPages[0].evaluate(el => el.textContent?.trim());
            for (let i = 1; i <= parseInt(totalPagesUse!); i++) {
                await page.waitForXPath('//input[@name="ctl00$cphMain$tcMain$tpInstruments$ucInstrumentsGridV2$cpInstruments_Top$txtResultsCurrentPage" and @value="' + i + '"]', { visible: true, timeout: 200000 });

                let totalRowHandle = await page.$x('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr');
                for (let i = 2; i < totalRowHandle!.length; i++) {
                    let recordDateHandle = await page.$x('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr[' + i + ']/td[2]');
                    let docTypeHandle = await page.$x('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr[' + i + ']/td[4]');
                    let docType = await docTypeHandle![0].evaluate(el => el.textContent?.trim());
                    let recordDateArray = await recordDateHandle![0].evaluate(el => el.innerHTML?.trim());
                    let recordDate = recordDateArray.split('<br>');

                    if (docType == '...' || docType == '' || docType == ' ' || recordDate[0]!.length > 10) {
                        continue
                    }

                    const Grantors = await page.$x('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr[' + i + ']/td[5]/div/table/tbody/tr/td')
                    const Grantes = await page.$x('//div[@id="ctl00_cphMain_tcMain_tpInstruments"]/div/table/tbody/tr[' + i + ']/td[6]/div/table/tbody/tr/td')
                    let names = [];
                    try {
                        for (let j = 0; j < Grantors.length; j++) {
                            let nameFull = await Grantors[j].evaluate(el => el.textContent);
                            names.push(nameFull!.trim())
                        }
                    } catch (err) {

                    }
                    try {
                        for (let j = 0; j < Grantes.length; j++) {
                            let nameFull = await Grantes[j].evaluate(el => el.textContent);
                            names.push(nameFull!.trim())
                        }
                    } catch (err) {

                    }


                    let practiceType = this.getPracticeType(docType!);
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if (name == '...' || name == '' || name == ' ' || name == '-----') {
                            continue
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue;
                        }

                        const data = {
                            'Property State': 'NC',
                            'County': 'Onslow',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: recordDate[0],
                            "productId": prod._id,
                            originalDocType: docType
                        };

                        if (await this.civilAndLienSaveToNewSchema(data)) {
                            countRecords += 1;
                        }
                    }
                }
                if (i != parseInt(totalPagesUse!)) {
                    let nextPageHandle = await page.$x('//input[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_ibResultsNextPage"]');
                    await nextPageHandle[0].click()
                    await this.randomSleepIn5Sec()
                }
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Onslow', 'North Carolina', countRecords, 'Civil & Lien');
            return true;
        } catch (e) {
            console.log(e);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Onslow', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}