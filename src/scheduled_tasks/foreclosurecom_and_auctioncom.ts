// cron(0/10 22-7 * * ? *)
require('dotenv').config();

import db from '../models/db';
import ForeclosureSource from '../categories/public_records/producers/foreclosure_source';
import AuctionSource from '../categories/public_records/producers/auction_source';

setTimeout(() => {
    console.log('Stopped because exceeded the time limit! (30 minutes)');
    process.exit();
}, 1800000); // 30 minutes

const state: string = process.argv[2];

( async () => {
    let publicRecordProducer;

    if(state){
        publicRecordProducer = await db.models.PublicRecordProducer.findOne({ source: 'foreclosurecom', state: state.toUpperCase() });
    } else {
        publicRecordProducer = await db.models.PublicRecordProducer.findOneAndUpdate({ source: 'foreclosurecom', processed: false }, { processed: true });
    }

    if(publicRecordProducer) {
        const foreclosureProducer = new ForeclosureSource(publicRecordProducer);
        await foreclosureProducer.startParsing();
        const auctionProducer = new AuctionSource(publicRecordProducer);
        await auctionProducer.startParsing();
    } else {
        console.log('WARNING: no more states to crawl');
    }

    process.exit();
})();