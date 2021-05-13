import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.nola.gov/resource/3ehi-je3s.json', handler: this.handleSource1 },
        { url: 'https://data.nola.gov/resource/u6yx-v2tw.json?o_c=Open', handler: this.handleSource2 },
        { url: 'https://data.nola.gov/resource/44ct-56tr.json?o_c=Open', handler: this.handleSource3 },
        { url: 'https://data.nola.gov/resource/8pqz-ftzc.json?o_c=Open', handler: this.handleSource4 },
        { url: 'https://dev.socrata.com/foundry/data.nola.gov/g7yr-kp9j?o_c=Open', handler: this.handleSource5 }
    ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();

        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
      return true;
    };


    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'violationdate', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.location;
                    const fillingdate = record.violationdate;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Code Enforcement All Violations';

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource2(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'casefiled', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.location;
                    const fillingdate = record.casefiled;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Code Enforcement All Cases';

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource3(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'caseestablished', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.propertyaddress;
                    const fillingdate = record.caseestablished;
                    const casetype = 'Code Enforcement All Hearings';
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource4(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'casefiled', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.location;
                    const fillingdate = record.casefiled;
                    const casetype = 'Code Enforcement Active Pipeline';
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource5(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'caseestablished', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.propertyaddress;
                    const fillingdate = record.caseestablished;
                    const casetype = 'Code Enforcement Hearings Calendar';
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}