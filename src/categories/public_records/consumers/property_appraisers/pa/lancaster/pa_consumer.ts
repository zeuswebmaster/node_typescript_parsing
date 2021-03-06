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
        propertyAppraiserPage: 'http://lancasterpa.devnetwedge.com/'
    }

    xpaths = {
        isPAloaded: '//input[@id="house-number-min"]'
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
     * analysis name
     * @param name 
     */
    discriminateAndRemove(name: string) : any {
      const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
      const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
      const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
      const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
      const companyRegex = new RegExp(companyRegexString, 'i');
      const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
      let isCompanyName = name.match(companyRegex);
      if (isCompanyName) {
          return {
              type: 'company',
              name: name
          }
      }
      
      let cleanName = name.match(removeFromNamesRegex);
      if (cleanName) {
          name = cleanName[1];
      }
      return {
          type: 'person',
          name: name
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
      const address2_number = address2.number===undefined ? '' : address2.number.trim().toUpperCase();
      const address1_prefix = address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
      const address2_prefix = address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase();
      const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
      const address2_type = address2.type===undefined ? '' : address2.type.trim().toUpperCase();
      const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
      const address2_street = address2.street===undefined ? '' : address2.street.trim().toUpperCase();

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
            // const address = this.getAddress(document);
            // const street_addr = address['street_with_type']; 

            let address;
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
                address = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    address = parser.parseLocation(parseaddr.street_address);
                }
                if(!address || (!address.number && !address.street)){
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
                if(this.searchBy == 'address'){
                    if (address.number) {
                    const inputNumHandle = await page.$('input#house-number-min');
                    if (inputNumHandle)
                        await inputNumHandle.type(address.number, {delay: 100});
                    else
                        continue;
                    }
                    // input address
                    const inputAddrHandle = await page.$('input#street-name');
                    if (address.street)
                        await inputAddrHandle?.type((address.prefix ? address.prefix+' ': '') + address.street + (address.unit ? ' '+address.unit: ''), {delay: 100});
                    else
                        continue;
                } else {
                    await page.type('input#owner-name', owner_name, {delay: 100});
                }

                await Promise.all([
                  page.keyboard.press('Enter'),
                  page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);

                // // check result
                const multi_results = await this.checkExistElement(page, 'div#search-results_wrapper');
                if (multi_results) {
                  let checkNotFound = await page.$x('//td[contains(text(), "No data available")]');
                  if (checkNotFound.length > 0){
                      console.log('Not found!');
                      break;
                  }
                  const currentYear = new Date().getFullYear();
                  await page.waitFor(1000);
                  await page.waitForSelector('table#search-results > tbody > tr:first-child > td:first-child');
                  if(this.searchBy == 'address'){
                    const property_handle = await page.$('table#search-results > tbody > tr:first-child > td:first-child');
                    if (property_handle) {
                        const property_number = await this.getElementTextContent(page, 'table#search-results > tbody > tr:first-child > td:first-child');
                        if (property_number.indexOf('No data available') > -1) break;
                        await page.goto('http://lancasterpa.devnetwedge.com/parcel/view/' + property_number.replace(/-/g, '') + '/' + currentYear, {waitUntil: 'networkidle0'});
                        const result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    }
                  } else {
                    const datalinks = [];
                    const search_results = await page.$x('//table[@id="search-results"]/tbody/tr');
                    for(const row of search_results){
                        let link = await row.evaluate(el => el.children[0].textContent?.trim());
                        link = "http://lancasterpa.devnetwedge.com/parcel/view/" + link?.replace(/-/g, '') + '/' + + currentYear;
                        let name = await row.evaluate(el => el.children[1].textContent?.trim());
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    }
                    for (let datalink of datalinks) {
                        try{
                            console.log("Processing => ", datalink);
                            await page.goto(datalink, {waitUntil: 'networkidle0'});
                            let result = await this.getPropertyInfos(page);
                            await this.parseResult(result, document);
                        } catch (e){
                            continue;
                        }
                    }
                  }
                }
                else {
                  let checkFoundOne = await page.$x('//div[text()="Property ID"]');
                  if(checkFoundOne.length > 0){
                    const result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                  } else {
                      console.log('Not found!');
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
        return true;
    }

    async parseResult(result: any, document: IOwnerProductProperty) {
        let dataFromPropertyAppraisers: any = {};
          dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['full_name'];
          dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['first_name'];
          dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['last_name'];
          dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middle_name'];
          dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
          dataFromPropertyAppraisers['Owner Occupied'] = result['owner_occupied'];
          dataFromPropertyAppraisers['Mailing Care of Name'] = '';
          dataFromPropertyAppraisers['Mailing Address'] = result['mailing_address'];
          if (result['mailing_address_parsed']) {
            dataFromPropertyAppraisers['Mailing City'] = result['mailing_address_parsed']['city'];
            dataFromPropertyAppraisers['Mailing State'] = result['mailing_address_parsed']['state'];
            dataFromPropertyAppraisers['Mailing Zip'] = result['mailing_address_parsed']['zip'];
          }
          dataFromPropertyAppraisers['Mailing Unit #'] = '';
          dataFromPropertyAppraisers['Property Type'] = result['property_type'];
          dataFromPropertyAppraisers['Total Assessed Value'] = result['total_assessed_value'];
          dataFromPropertyAppraisers['Last Sale Recording Date'] = result['last_sale_recording_date'];
          dataFromPropertyAppraisers['Last Sale Amount'] = result['last_sale_amount'];
          dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
          dataFromPropertyAppraisers['Est Value'] = result['est_value'];
          dataFromPropertyAppraisers['yearBuilt'] = result['year_built'];
          dataFromPropertyAppraisers['Est Equity'] = '';
          dataFromPropertyAppraisers['County'] = 'Lancaster';
          dataFromPropertyAppraisers['Property State'] = 'PA';
          dataFromPropertyAppraisers['Property Address'] = result['property_address'];
          try {
              await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
          } catch(e){
              //
          }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const owner_names = [];
      const owner_name_selector = '#Names + div > div.panel-body > div > div:first-child > div > div:first-child > div:nth-child(2)';
      const owner_name = await this.getElementTextContent(page, owner_name_selector);
      const owner_name_arr = owner_name.split('&');
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter.trim() === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter.trim());
        owner_names.push(ownerName);
      }

      // mailing address
      const addr_selector = '#Names + div > div.panel-body > div > div:first-child > div > div:nth-child(2) > div:nth-child(2)';
      const city_selector = '#Names + div > div.panel-body > div > div:first-child > div > div:nth-child(2) > div:nth-child(4)';
      const addr = await this.getElementTextContent(page, addr_selector);
      const city = await this.getElementTextContent(page, city_selector);
      let mailing_address = addr + ', ' + city;
      mailing_address = this.simplifyString(mailing_address);
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      let property_address = await this.getTextContentByXpathFromPage(page, '//div[text()="Site Address"]/parent::div/div[2]')
      property_address = property_address.replace(/\s+/g, ' ').trim();
      let property_address_parsed = parser.parseLocation(property_address);
      // owner occupied
      const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      
      // property type
      const property_type_selector = 'a#Structures + div > div.table-responsive > table > tbody > tr > td:first-child';
      let property_type = await this.getElementTextContent(page, property_type_selector);
      property_type = property_type.replace(/^.+- /g, '').trim();

      // sales info
      const last_sale_date_selector = 'a#SalesHistory + div > div.table-responsive > table > tbody > tr:first-child > td:nth-child(4)';
      const last_sale_amount_selector = 'a#SalesHistory + div > div.table-responsive > table > tbody > tr:first-child > td:nth-child(7)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // assessed value and est. value
      const total_assessed_selector = 'a#Assessments + div > div.table-responsive > table > tbody > tr:nth-child(3) > td:nth-child(4)';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_selector);
      const est_value = '';

      const year_built_selector = 'a#Structures + div > div.table-responsive > table > tbody > tr > td:last-child';
      let year_built = await this.getElementTextContent(page, year_built_selector);

      return {
        owner_names, 
        mailing_address,
        mailing_address_parsed, 
        owner_occupied,
        property_type,
        property_address,
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value,
        year_built
      }
    }
}