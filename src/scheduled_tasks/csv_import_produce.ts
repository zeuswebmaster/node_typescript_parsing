require('dotenv').config();

import { parseCsv } from '../routes/import';
import S3Service from '../services/s3_service';

// example folderName: 'fl/broward/2021-05-06'
const getKeys = async (folderName: string) => {
    let keys = [];
    const s3Service = new S3Service();
    const params = {
        Bucket: 'clerk-of-courts',
        Delimiter: '/',
        Prefix: folderName + '/'
    }
    const data = await s3Service.s3.listObjects(params).promise();
    if(data && data['Contents']){
        for (let index = 1; index < data['Contents'].length; index++) {
            keys.push(data['Contents'][index]['Key']);
        }
    }
    return keys;
}

// example key: 'fl/broward/2021-05-06/MOPROBAT.txt
const getCsvString = async (key: any) => {
    const s3Service = new S3Service();
    const object = await s3Service.getObject('clerk-of-courts', key);

    if (object.Body) {
        const csvString = object.Body.toString('utf-8');
        return csvString;
    }
    return false;
}

function getFormattedDate(date: Date) {
    let year: any = date.getFullYear();
    let month: any = (1 + date.getMonth());
    let day: any = date.getDate();
    if (year === NaN || day === NaN || month === NaN) {
        return '';
    }
    month = month.toString().padStart(2, '0');
    day = day.toString().padStart(2, '0');
    return year + '-' + month + '-' + day;
}

// example key: 'fl/broward/2021-05-06/MOPROBAT.txt
function getPracticeTypeFromKey(key: any): string {
    if(key.match(/PROBAT/)){
        return 'probate';
    } else if (key.match(/TENANT/) || key.match(/EVICT/)){
        return 'eviction';
    } else if (key.match(/WKCIVILGAR/) || key.match(/CIVL/)){
        return 'civil';
    } else if (key.match(/FELONY/) || key.match(/MISDEM/)){
        return 'criminal';
    } else if (key.match(/TCDISPO/) || key.match(/TIDISPO/) || key.match(/INFRAC/) || key.match(/TRFFIC/)){
        return 'traffic';
    }
    return '';
}

export const processCsvImport = async (state: string, county: string) => {
    try{
        let today = new Date();
        let todayString = getFormattedDate(today);
        // let todayString = "2021-05-06";
        let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
        let keys = await getKeys(folderName);
        for (const key of keys){
            console.log("Processing:", key);
            let csvString = await getCsvString(key);
            if(csvString){
                let practiceType: string = getPracticeTypeFromKey(key);
                let fileName: any = key?.split('/').pop();

                console.log(practiceType, fileName);
                if(fileName && practiceType != ''){
                    await parseCsv(practiceType, state.toLowerCase(), county, csvString, fileName, false);
                }
            }
        }
        return true;
    } catch(e){
        console.log(e);
        return false;
    }
}

// setTimeout(() => {
//     console.log('Stopped because exceeded the time limit! (3 hours)');
//     process.exit();
// }, 10800000); // 3 hours
// ( async () => {

//     // example folderName: 'fl/broward/2021-05-06'
//     const getKeys = async (folderName: string) => {
//         let keys = [];
//         const s3Service = new S3Service();
//         const params = {
//             Bucket: 'clerk-of-courts',
//             Delimiter: '/',
//             Prefix: folderName + '/'
//         }
//         const data = await s3Service.s3.listObjects(params).promise();
//         if(data && data['Contents']){
//             for (let index = 1; index < data['Contents'].length; index++) {
//                 keys.push(data['Contents'][index]['Key']);
//             }
//         }
//         return keys;
//     }

//     // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
//     const getCsvString = async (key: any) => {
//         const s3Service = new S3Service();
//         const object = await s3Service.getObject('clerk-of-courts', key);

//         if (object.Body) {
//             const csvString = object.Body.toString('utf-8');
//             return csvString;
//         }
//         return false;
//     }

//     function getFormattedDate(date: Date) {
//         let year: any = date.getFullYear();
//         let month: any = (1 + date.getMonth());
//         let day: any = date.getDate();
//         if (year === NaN || day === NaN || month === NaN) {
//             return '';
//         }
//         month = month.toString().padStart(2, '0');
//         day = day.toString().padStart(2, '0');
//         return year + '-' + month + '-' + day;
//     }

//     // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
//     function getPracticeTypeFromKey(key: any): string {
//         if(key.match(/PROBAT/)){
//             return 'probate';
//         } else if (key.match(/TENANT/) || key.match(/EVICT/)){
//             return 'eviction';
//         } else if (key.match(/CIVIL/) || key.match(/CIVL/)){
//             return 'civil';
//         } else if (key.match(/FELONY/) || key.match(/MISDEM/)){
//             return 'criminal';
//         } else if (key.match(/TCDISPO/) || key.match(/TCDISPO/) || key.match(/INFRAC/) || key.match(/TRFFIC/)){
//             return 'traffic';
//         }
//         return '';
//     }

//     let countiesWithCSV: any = {
//         "FL": [ "broward" ]
//     };

//     for(const state in countiesWithCSV){
//         let counties = countiesWithCSV[state];
//         for(const county of counties){
//             let today = new Date();
//             let todayString = getFormattedDate(today);
//             let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
//             let keys = await getKeys(folderName);
//             for (const key of keys){
//                 console.log("Processing:", key);
//                 let csvString = await getCsvString(key);
//                 if(csvString){
//                     let practiceType: string = getPracticeTypeFromKey(key);
//                     let fileName: any = key?.split('/').pop();

//                     console.log(practiceType, fileName);
//                     if(fileName && practiceType != ''){
//                         await parseCsv(practiceType, state.toLowerCase(), county, csvString, fileName, false);
//                     }
//                 }
//             }
//         }
//     }
//     process.exit();
// })();