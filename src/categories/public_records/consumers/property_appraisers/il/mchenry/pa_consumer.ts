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
        propertyAppraiserPage: 'https://mchenryil.devnetwedge.com/'
    }

    xpaths = {
        isPAloaded: '//input[@id="owner-name"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
      super();
      this.publicRecordProducer = publicRecordProducer;
      this.ownerProductProperties = ownerProductProperties;
      this.browser = browser;
      this.browserPages.propertyAppraiserPage = page;
    }
    
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
    

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm);
      return text.trim();
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      let parserName = nameParsingService.newParseNameFML(name_str);

      result['full_name'] = parserName.fullName;
      result['first_name'] = parserName.firstName;
      result['last_name'] = parserName.lastName;
      result['middle_name'] = parserName.middleName;
      result['suffix'] = parserName.suffix;
      return result;
    }

    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    compareAddress(address1: any, address2: any): Boolean {
        const address1_number = address1.number === undefined ? '' : address1.number.trim().toUpperCase();
        const address2_number = address2 ? (address2.number === undefined ? '' : address2.number.trim().toUpperCase()) : '';
        const address1_prefix = address1 && address1.prefix === undefined ? '' : address1.prefix.trim().toUpperCase();
        const address2_prefix = address2 ? (address2.prefix === undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
        const address1_type = address1.type === undefined ? '' : address1.type.trim().toUpperCase();
        const address2_type = address2 ? (address2.type === undefined ? '' : address2.type.trim().toUpperCase()) : '';
        const address1_street = address1.street === undefined ? '' : address1.street.trim().toUpperCase();
        const address2_street = address2 ? (address2.street === undefined ? '' : address2.street.trim().toUpperCase()) : '';

        return (address1_number === address2_number) &&
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
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
              const nameInfo = this.getNameInfo(document.ownerId);
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
                }
                if(!parsed_addr || (!parsed_addr.number && !parsed_addr.street)){
                    console.log("Street name and number is missing!");
                    return false;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }
            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {
                await page.waitForSelector('input#owner-name');
                if (this.searchBy == 'name'){
                    await page.type('input#owner-name', owner_name, {delay: 150});
                } else {
                    if(parsed_addr.number){
                        await page.type('input#house-number-min', parsed_addr.number, {delay: 150});
                    }
                    if(parsed_addr.street){
                        await page.type('input#street-name', (parsed_addr.prefix ? parsed_addr.prefix+' ': '') + parsed_addr.street + (parsed_addr.unit ? ' '+parsed_addr.unit: ''), {delay: 150});
                    }
                }
                let buttonSearch = await page.$x('//button[text()="Search"]');
                await Promise.all([
                    buttonSearch[0].click(),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                await this.sleep(1000);
                const search_results = await page.$x('//table[@id="search-results"]/tbody/tr');
                if(search_results.length < 2){
                    let checkFound = await page.$x('//td[contains(., "Site Address")]/div[2]/text()[1]');
                    let checkNotFound = await page.$x('//td[contains(text(), "No data available")]');
                    if (checkFound.length > 0){
                        let result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } else if (checkNotFound.length > 0){
                        console.log("Not found!");
                    }
                    break;
                }
                const datalinks: any = [];
                if(this.searchBy == 'name'){
                    for(const row of search_results){
                        try{
                            let parcelnum = await row.evaluate(el => el.children[1].textContent?.trim());
                            let parcelyear = await row.evaluate(el => el.children[0].textContent?.trim());
                            let link = "https://mchenryil.devnetwedge.com/parcel/view/" + parcelnum + "/" + parcelyear;
                            let name = await row.evaluate(el => el.children[2].textContent?.trim());
                            const regexp = new RegExp(owner_name_regexp);
                            if (regexp.exec(name!.toUpperCase())){
                                datalinks.push(link);
                            }
                        } catch(e){
                            continue;
                        }
                    }
                } else {
                    let parcelnum = await search_results[0].evaluate(el => el.children[1].textContent?.trim());
                    let parcelyear = await search_results[0].evaluate(el => el.children[0].textContent?.trim());
                    let link = "https://mchenryil.devnetwedge.com/parcel/view/" + parcelnum + "/" + parcelyear;
                    datalinks.push(link);
                }
                if (datalinks.length === 0) {
                    console.log("The search results is not reliable! (different from the keyword)");
                    break;
                }
                console.log(datalinks);
                for (let datalink of datalinks) {
                    try{
                        console.log("Processing => ", datalink);
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        if(this.searchBy == 'name'){
                          let owner_info = await this.getTextByXpathFromPage(page, '//div[text()="Owner Name & Address"]/parent::td/div[2]');
                          const regexp = new RegExp(owner_name_regexp);
                          if(!regexp.exec(owner_info.toUpperCase())){
                            continue;
                          }
                        }
                        let result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } catch (e){
                        console.log(e);
                        console.log('Error during parse property (possibly property is N/A)');
                        continue;
                    }
                }
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(1000);
              }    
            }
            await this.randomSleepIn5Sec();
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
          'Mailing Address': result['mailing_address'] || '',
          'Mailing Unit #': '',
          'Mailing City': result['mailing_city'] || '',
          'Mailing State': result['mailing_state'] || '',
          'Mailing Zip': result['mailing_zip'] || '',
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_city'] || '',
          'Property State': this.publicRecordProducer.state.toUpperCase(),
          'Property Zip': result['property_zip'] || '',
          'County': this.publicRecordProducer.county,
          'Owner Occupied': result['owner_occupied'],
          'Property Type': result['property_type'] || '',
          'Total Assessed Value': result['total_assessed_value'],
          'Last Sale Recording Date': result['last_sale_recording_date'],
          'Last Sale Amount': result['last_sale_amount'],
          'Est. Remaining balance of Open Loans': '',
          'Est Value': result['est_value'],
          'yearBuilt': '',
          'Est Equity': '',
          'Lien Amount': ''
      };
      try{
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//th[text()="Tax Bill"]/ancestor::table/tbody/tr[1]/td[1]';
      let full_name_site = await this.getTextByXpathFromPage(page, full_name_xpath);
      let full_name_arr = full_name_site.split(/\s+/g);
      const owner_names = [];
      let full_name = '';
      full_name += full_name_arr.shift();
      if(full_name_arr[0].length == 1){
        full_name += ' ' + full_name_arr.shift();
      }
      full_name += ' ' + full_name_arr.pop();
      full_name = full_name.trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_xpath = '//td[contains(., "Site Address")]/div[2]/text()[1]';
      const property_address_2_xpath = '//td[contains(., "Site Address")]/div[2]/text()[last()]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\s+/g, " ");
      let property_address_parsed = parser.parseLocation(property_address);
      let property_address_2 = await this.getTextByXpathFromPage(page, property_address_2_xpath);
      let property_address_2_arr = property_address_2.split(/\s+/g);
      let property_zip: any = '';
      if(property_address_2_arr[property_address_2_arr.length - 1].match(/\d+/)){
        property_zip = property_address_2_arr.pop();
      }
      let property_state = property_address_2_arr.pop();
      let property_city = '';
      for (const word of property_address_2_arr){
        property_city += word + " ";
      }
      property_city = property_city.replace(",","").trim();

      // mailing address
      const mailing_address_full_xpath = '//th[text()="Tax Bill"]/ancestor::table/tbody/tr[1]/td[3]';
      let mailing_address_full = await this.getTextByXpathFromPage(page, mailing_address_full_xpath);
      let mailing_address = '';
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(!this.isEmptyOrSpaces(mailing_address_full)){
        let parsed_mailing_address = parser.parseLocation(mailing_address_full);
        mailing_address = ((parsed_mailing_address.number ? parsed_mailing_address.number : '') + ' ' + (parsed_mailing_address.street ? parsed_mailing_address.street : '') + ' ' + (parsed_mailing_address.type ? parsed_mailing_address.type : '')).trim();
        mailing_zip = parsed_mailing_address.zip ? parsed_mailing_address.zip : '';
        mailing_state = parsed_mailing_address.state ? parsed_mailing_address.state : '';
        mailing_city = parsed_mailing_address.city ? parsed_mailing_address.city : '';
      }

      const mailing_address_parsed = parser.parseLocation(mailing_address);
      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // sales info"
      const last_sale_recording_date_xpath = '//th[text()="Sale Date"]/ancestor::table/tbody/tr[1]/td[4]';
      const last_sale_amount_xpath = '//th[text()="Sale Date"]/ancestor::table/tbody/tr[1]/td[7]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//div[text()="Property Class"]/parent::td/div[2]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//div[text()="Net Taxable Value"]/parent::td/div[2]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = '';

      return {
        owner_names, 
        property_address,
        property_city,
        property_state,
        property_zip,
        property_address_parsed,
        mailing_address,
        mailing_city,
        mailing_zip,
        mailing_state,
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value
      }
    }
}