import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://assessment.nnva.gov/PT/search/commonsearch.aspx?mode=address'
    }

    xpaths = {
        isPAloaded: '//button[@id="btAgree"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
      super();
      this.publicRecordProducer = publicRecordProducer;
      this.ownerProductProperties = ownerProductProperties;
      this.browser = browser;
      this.browserPages.propertyAppraiserPage = page;
    }

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
    async init(): Promise<boolean> {
      if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
      await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
      let retries = 0;
      while (true) {
        try {
          await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
          break;
        } catch (err) {
          console.log(err);
          retries++;
          if (retries > 15) {
              console.log('******** website loading failed');
              return false;
          }
          this.randomSleepIn5Sec();
          console.log(`******** website loading failed, retring... [${retries}]`);
        }
      }
      return true;
    };

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        try {
            await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    /**
     * convert address to required infos
     * @param document : IPublicRecordAttributes 
     *  full_address:  1527 N 23rd St, Lincoln, NE 68503
        street_name:   23rd St
        street_full:   1527 N 23rd St
        parsed
            number:     1527
            prefix:     N
            street:     23rd
            type:     St
            city:       Lincoln
            state:      NE
            zip:        68503
     */
    getAddress(document: any): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      console.log(full_address);
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street ? parsed.street.trim() : '';
      let street_full = document['Property Address'];
      let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + (parsed.street ? parsed.street : '');
      street_with_type = street_with_type.trim();

      return {
        full_address,
        street_name,
        street_with_type,
        street_full,
        parsed
      }
    }

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
      const exist = await page.$(selector).then(res => res !== null);
      return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        let content = await page.$eval(selector, el => el.textContent)
        return content ? content.trim() : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }
    /**
     * get innerHTML from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementHtmlContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        const content = await page.$eval(selector, el => el.innerHTML)
        return content ? content : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      let parserName = nameParsingService.newParseName(name_str);

      result['full_name'] = parserName.fullName;
      result['first_name'] = parserName.firstName;
      result['last_name'] = parserName.lastName;
      result['middle_name'] = parserName.middleName;
      result['suffix'] = parserName.suffix;
      return result;
    }

    getSuffix(name: string) : any {
      const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
      name = name.toLowerCase();
      for(let suffix of suffixList){
          let regex = new RegExp(' '+suffix, 'gm');
          if (name.match(regex)){
              return suffix;
          }
      }
      return '';
    }
    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    /**
     * Compare 2 addresses
     * @param address1 
     * @param address2 
     */
    compareAddress(address1: any, address2: any): Boolean {
      const address1_number = address1.number===undefined ? '' : address1.number.trim().toUpperCase();
      const address2_number = address2 ? (address2.number===undefined ? '' : address2.number.trim().toUpperCase()) : '';
      const address1_prefix = address1 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
      const address2_prefix = address2 ? (address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
      const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
      const address2_type = address2 ? (address2.type===undefined ? '' : address2.type.trim().toUpperCase()) : '';
      const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
      const address2_street = address2 ? (address2.street===undefined ? '' : address2.street.trim().toUpperCase()) : '';

      return  (address1_number === address2_number) &&
              (address1_prefix === address2_prefix) &&
              (address1_type === address2_type) &&
              (address1_street === address2_street);
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;

            if (!this.decideSearchByV2(document)) {
                return false;
              }
            
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
            let search_addr;

            if (this.searchBy === 'name') {
                console.log("By name detected! The site is only supported searched by property address: https://assessment.nnva.gov/PT/search/commonsearch.aspx?mode=address");
                return false;
            }
            parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
            search_addr = document.propertyId['Property Address'];
            const parsev2 = this.getAddressV2(document.propertyId);
            if(!this.isEmptyOrSpaces(parsev2.street_address)){
                parsed_addr = parser.parseLocation(parsev2.street_address);
                search_addr = parsev2.street_address;
            }

            if(!parsed_addr || (!parsed_addr.number && !parsed_addr.street)){
                console.log("Street number & street name is missing!");
                return false;
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                let tosButton = await page.$x('//button[@id="btAgree"]');
                if(tosButton.length > 0){
                    await page.focus('button#btAgree');
                    await Promise.all([
                        // tosButton[0].click(),
                        page.keyboard.press('Enter'),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ])
                }
                await page.waitForSelector('input#inpNumber');
                if(parsed_addr.number){
                    await page.type('input#inpNumber', parsed_addr.number, {delay: 50})
                }
                if(parsed_addr.street){
                    await page.type('input#inpStreet', parsed_addr.street, {delay: 50})
                }
                await Promise.all([
                    page.click('button#btSearch'),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                let found = await page.$x('//div[@name="OWNER"]');
                if(found.length < 1){
                    console.log("Not found!");
                    break;
                }
                const result = await this.getPropertyInfos(page);
                await this.parseResult(result, document);
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(1000);
              }    
            }                       
        return true;
    }

    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['owner_names'][0]['full_name'],
            'First Name': result['owner_names'][0]['first_name'],
            'Last Name': result['owner_names'][0]['last_name'],
            'Middle Name': result['owner_names'][0]['middle_name'],
            'Name Suffix': result['owner_names'][0]['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': '',
            'Mailing Unit #': '',
            'Mailing City': '',
            'Mailing State': '',
            'Mailing Zip': '',
            'Property Address': document.propertyId['Property Address'],
            'Property Unit #': '',
            'Property City': document.propertyId['Property City'] || '',
            'Property State': this.publicRecordProducer.state.toUpperCase(),
            'Property Zip': document.propertyId['Property Zip'] || '',
            'County': this.publicRecordProducer.county,
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'],
            'Total Assessed Value': result['total_assessed_value'],
            'Last Sale Recording Date': result['last_sale_recording_date'],
            'Last Sale Amount': result['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'],
            'yearBuilt': result['year_built'],
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            // console.log(dataFromPropertyAppraisers);
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.trim();
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
        // name
        const full_name_xpath = '//td[contains(., "Name")]/parent::tr/td[2]';
        let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
        const owner_names = [];
        full_name = full_name.split(",")[0].trim();
        let parseName = this.parseOwnerName(full_name);
        owner_names.push(parseName);
  
        // property address
        const property_address_xpath = '//td[contains(., "Property Location")]/parent::tr/td[2]';
        let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
        let property_address_parsed = parser.parseLocation(property_address);
  
        // owner occupied
        let owner_occupied = false;

        // property type
        const property_type = '';

        let salesTab = await page.$x('//a[contains(., "Sales")]');
        await Promise.all([
            salesTab[0].click(),
            page.waitForNavigation({waitUntil: 'networkidle0'})
        ])
        // sales info"
        const last_sale_recording_date_xpath = '//table[@id="Sales History"]/tbody/tr[2]/td[1]';
        const last_sale_amount_xpath = '//table[@id="Sales History"]/tbody/tr[2]/td[2]';
        const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
        const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

        let valueTab = await page.$x('//a[contains(., "Values")]');
        await Promise.all([
            valueTab[0].click(),
            page.waitForNavigation({waitUntil: 'networkidle0'})
        ])
        // assessed value and est. value
        const total_assessed_value_xpath = '//table[@id="Values History"]/tbody/tr[2]/td[4]';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
        const est_value = '';

        let buildingTab = await page.$x('//a[contains(., "Residential")]');
        await Promise.all([
            buildingTab[0].click(),
            page.waitForNavigation({waitUntil: 'networkidle0'})
        ])
        const year_built = await this.getTextByXpathFromPage(page, '//td[contains(., "Year Built")]/parent::tr/td[2]');
  
        return {
          owner_names, 
          property_address,
          property_address_parsed,
          owner_occupied,
          property_type, 
          total_assessed_value, 
          last_sale_recording_date, 
          last_sale_amount, 
          est_value,
          year_built
        }
      }
}