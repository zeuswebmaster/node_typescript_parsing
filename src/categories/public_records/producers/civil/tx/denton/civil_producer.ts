import PublicSearchUsProducer from "../../publicsearch_us_producer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends PublicSearchUsProducer {
    url = 'https://denton.tx.publicsearch.us/';
    state = 'TX';
    fullState = 'texas';
    county = 'denton';

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}
