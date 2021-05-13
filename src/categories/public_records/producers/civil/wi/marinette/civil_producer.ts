import WisconsinSearchProducer from '../wisconsin_search_producer';
import {IPublicRecordProducer} from "../../../../../../models/public_record_producer";

export default class CivilProducer extends WisconsinSearchProducer {

    state = 'WI';
    stateFull = 'Wisconsin'
    countyId = 38;
    county = 'Marinette';

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }

}