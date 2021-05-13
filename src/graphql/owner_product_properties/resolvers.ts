import db from "../../models/db";
import { verifyToken } from "../../services/jwt_service";
import { IOwnerProductProperty } from "../../models/owner_product_property";
import AddressService from "../../services/address_service";
import { normalizeDate } from "../../services/general_service";
import mongoose from "mongoose";
import moment from "moment";
import { add } from "lodash";

export default {
  Query: {
    async fetchOwnerProductProperties(parent: any, args: any): Promise<any> {
      const token = args["token"];
      const validate: any = await verifyToken(token);

      if (validate["valid"]) {
        const filters = args["filters"] ? JSON.parse(args["filters"]) : [];
        let filterProperty: any = {};
        for (let i = 0; i < filters.length; i++) {
          const key =
            filters[i][0].indexOf("Name") > -1 ||
            filters[i][0].indexOf("Mailing") > -1
              ? "owner"
              : "property";
          filterProperty[`${key}.${filters[i][0]}`] = {
            $regex: new RegExp(filters[i][1], "i"),
          };
        }
        console.log("filterProperty = ", filterProperty);
        const practiceType = args["practiceType"]
          ? args["practiceType"]
          : "all";
        const perPage = args["perPage"] ? args["perPage"] : 20;
        const currentPage = args["currentPage"] ? args["currentPage"] : 0;
        const from = args["from"];
        const to = args["to"];
        const skipRecords = perPage * (currentPage - 1);
        const selState = args["state"];
        const selCounty = args["county"];
        const zip = args["zip"];
        const productIdsCount = args["owners"];
        console.log("the from date: ", from);
        console.log("the to date: ", to);
        console.log("practiceType: ", practiceType);
        console.log("state: ", selState);
        console.log("county: ", selCounty);
        console.log("zip: ", zip);
        console.log("productIds count: ", productIdsCount);

        let dateFrom = new Date(new Date(from).setHours(0, 0, 0));
        let dateTo = new Date(new Date(to).setHours(23, 59, 59));
        let condition: any = {
          createdAt: {
            $gte: dateFrom,
            $lt: dateTo,
          },
          processed: true,
          consumed: true,
          ownerId: { $ne: null },
          propertyId: { $ne: null },
        };

        if (
          practiceType.length < 30 ||
          selState !== "all" ||
          selCounty !== "all"
        ) {
          let productIdsArr = [];
          for (const practice of practiceType) {
            let regexpProduct = `/${selState === "all" ? ".*" : selState}/${
              selCounty === "all" ? ".*" : selCounty
            }/${practice}$`;
            console.log(regexpProduct);
            const productIds = await db.models.Product.find({
              name: { $regex: new RegExp(regexpProduct, "i") },
            }).exec();
            for (const productId of productIds) {
              productIdsArr.push(productId._id);
            }
          }
          condition = { ...condition, productId: { $in: productIdsArr } };
        }

        console.log(
          "ensure performance index exists on condition: ",
          condition
        );
        let aggregateConditions: any[] = [
          {
            $lookup: {
              from: "properties",
              localField: "propertyId",
              foreignField: "_id",
              as: "property",
            },
          },
          { $unwind: "$property" },
          {
            $lookup: {
              from: "owners",
              localField: "ownerId",
              foreignField: "_id",
              as: "owner",
            },
          },
          { $unwind: "$owner" },
          {
            $lookup: {
              from: "products",
              localField: "productId",
              foreignField: "_id",
              as: "product",
            },
          },
          { $unwind: "$product" },
          {
            $group: {
              _id: {
                owner: "$owner",
                productId: "$productId",
                propertyId: "$propertyId",
                property: "$property",
                product: "$product",
              },
            },
          },
          {
            $group: {
              _id: "$_id.owner._id",
              distinct: {
                $addToSet: {
                  owner: "$_id.owner",
                  productId: "$_id.productId",
                  propertyId: "$_id.propertyId",
                  property: "$_id.property",
                  product: "$_id.product",
                },
              },
              count: { $sum: 1 },
            },
          },
        ];

        if (zip) {
          aggregateConditions.push({
            $match: {
              "property.Property Zip": {
                $in: [zip],
              },
            },
          });
        }

        if (productIdsCount != "" && productIdsCount != "all") {
          aggregateConditions.push(
            {
              $group: {
                _id: { ownerId: "$ownerId" },
                uniqueIds: { $addToSet: "$_id" },
                count: { $sum: 1 },
              },
            },
            {
              $match: {
                count: { $eq: parseInt(productIdsCount) },
              },
            }
          );
        }

        let docs: any[] = await db.models.OwnerProductProperty.aggregate([
          { $match: condition },
          { $skip: skipRecords },
          ...aggregateConditions,
        ])
          .limit(perPage)
          .allowDiskUse(true);
        const countField = "createdAt";
        let match: any[] = [];
        if (zip) {
          match = [
            {
              $lookup: {
                from: "properties",
                localField: "propertyId",
                foreignField: "_id",
                as: "property",
              },
            },
            {
              $match: {
                "property.Property Zip": {
                  $in: [zip],
                },
              },
            },
          ];
        }
        const countResult: any[] =
          await db.models.OwnerProductProperty.aggregate([
            { $match: condition },
            ...match,
            { $count: countField },
          ]);
        const count = (countResult[0] && countResult[0][countField]) || 0;
        console.log("COUNT = ", count);
        const practiceTypes: any = {
          foreclosure: "Foreclosure",
          preforeclosure: "Preforeclosure",
          bankruptcy: "Bankruptcy",
          "tax-lien": "Tax Lien",
          auction: "Auction",
          inheritance: "Inheritance",
          probate: "Probate",
          eviction: "Eviction",
          "hoa-lien": "Hoa Lien",
          "irs-lien": "Irs Lien",
          "mortgage-lien": "Mortgage Lien",
          "pre-inheritance": "Pre Inheritance",
          "pre-probate": "Pre Probate",
          divorce: "Divorce",
          "tax-delinquency": "Tax Delinquency",
          "code-violation": "Code Violation",
          "absentee-property-owner": "Absentee Property Owner",
          vacancy: "Vacancy",
          debt: "Debt",
          "personal-injury": "Personal Injury",
          marriage: "Marriage",
          "child-support": "Child Support",
          criminal: "Criminal",
          "insurance-claims": "Insurance Claims",
          "employment-discrimination": "Employment Discrimination",
          traffic: "Traffic",
          "property-defect": "Property Defect",
          "declaratory-judgment": "Declaratory Judgment",
          "other-civil": "Other Civil",
        };
        console.log(
          "size should be no more than maximum pagination size: ",
          docs.length
        );

        if (productIdsCount != "" && productIdsCount != "all") {
          let uniqueIds = [];
          for (const doc of docs) {
            for (const uniqueId of doc.uniqueIds) {
              uniqueIds.push(uniqueId);
            }
          }
          let aggregateConditions: any[] = [
            {
              $lookup: {
                from: "properties",
                localField: "propertyId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
            {
              $lookup: {
                from: "owners",
                localField: "ownerId",
                foreignField: "_id",
                as: "owner",
              },
            },
            { $unwind: "$owner" },
            {
              $lookup: {
                from: "products",
                localField: "productId",
                foreignField: "_id",
                as: "product",
              },
            },
            { $unwind: "$product" },
            {
              $group: {
                _id: {
                  owner: "$owner",
                  productId: "$productId",
                  propertyId: "$propertyId",
                  property: "$property",
                  product: "$product",
                },
              },
            },
            {
              $group: {
                _id: "$_id.owner._id",
                distinct: {
                  $addToSet: {
                    owner: "$_id.owner",
                    productId: "$_id.$productId",
                    propertyId: "$_id.$propertyId",
                    property: "$_id.property",
                    product: "$_id.product",
                  },
                },
                count: { $sum: 1 },
              },
            },
          ];
          condition = {
            _id: { $in: uniqueIds },
          };
          docs = await db.models.OwnerProductProperty.aggregate([
            { $match: condition },
            ...aggregateConditions,
          ]).allowDiskUse(true);
        }

        const records: any[] = [];
        for (const doc of docs) {
          const record: any = {};
          console.log(doc);
          let last_sale_recording_date: any = normalizeDate(
            doc["property"]?.["Last Sale Recording Date"]
          );
          // check property address
          let property_address =
            doc.distinct[0]["property"]?.["Property Address"];
          let property_city = doc.distinct[0]["property"]?.["Property City"];
          let property_state = doc.distinct[0]["property"]?.["Property State"];
          let property_zip = doc.distinct[0]["property"]?.["Property Zip"];
          if (AddressService.detectFullAddress(property_address)) {
            const parsed_address =
              AddressService.getParsedAddress(property_address);
            if (parsed_address) {
              property_address = parsed_address.street_address;
              if (!property_city) property_city = parsed_address.city;
              if (!property_state) property_state = parsed_address.state;
              if (!property_zip) property_zip = parsed_address.zip;
            }
          }

          // check mailing address
          let mailing_address = doc.distinct[0]["owner"]?.["Mailing Address"];
          let mailing_city = doc.distinct[0]["owner"]?.["Mailing City"];
          let mailing_state = doc.distinct[0]["owner"]?.["Mailing State"];
          let mailing_zip = doc.distinct[0]["owner"]?.["Mailing Zip"];
          if (AddressService.detectFullAddress(mailing_address)) {
            const parsed_address =
              AddressService.getParsedAddress(mailing_address);
            if (parsed_address) {
              mailing_address = parsed_address.street_address;
              if (!mailing_city) mailing_city = parsed_address.city;
              if (!mailing_state) mailing_state = parsed_address.state;
              if (!mailing_zip) mailing_zip = parsed_address.zip;
            }
          }

          if (property_zip == "" && mailing_zip != "") {
            if (
              AddressService.compareFullAddress(
                property_address,
                mailing_address
              ) &&
              property_state == mailing_state
            ) {
              property_zip = mailing_zip;
              if (property_city == "") property_city = mailing_city;
            }
          }

          record["Created At"] = moment(doc.distinct[0]["createdAt"])
            .format("MM-DD-YYYY")
            .toString();
          record["Updated At"] = moment(doc.distinct[0]["updatedAt"])
            .format("MM-DD-YYYY")
            .toString();
          const practiceType = doc.distinct[0]["product"]?.["name"]
            ?.split("/")[3]
            ?.trim();
          record["Practice Type"] = practiceTypes[practiceType];
          record["Full Name"] = doc.distinct[0]["owner"]?.["Full Name"];
          record["First Name"] = doc.distinct[0]["owner"]?.["First Name"];
          record["Last Name"] = doc.distinct[0]["owner"]?.["Last Name"];
          record["Middle Name"] = doc.distinct[0]["owner"]?.["Middle Name"];
          record["Name Suffix"] = doc.distinct[0]["owner"]?.["Name Suffix"];
          record["Phone"] = doc.distinct[0]["owner"]?.["Phone"];
          record["Mailing Address"] = mailing_address;
          record["Mailing Unit #"] =
            doc.distinct[0]["owner"]?.["Mailing Unit #"];
          record["Mailing City"] = mailing_city;
          record["Mailing State"] = mailing_state;
          record["Mailing Zip"] = mailing_zip;
          record["Property Address"] = property_address;
          record["Property Unit #"] =
            doc.distinct[0]["property"]?.["Property Unit #"];
          record["Property City"] = property_city;
          record["Property Zip"] = property_zip;
          record["Property State"] = property_state;
          record["County"] = doc.distinct[0]["property"]?.["County"];
          record["Owner Occupied"] =
            doc.distinct[0]["property"]?.["Owner Occupied"];
          record["Property Type"] =
            doc.distinct[0]["property"]?.["Property Type"];
          record["Total Assessed Value"] =
            doc["property"]?.["Total Assessed Value"];
          record["Last Sale Recording Date"] = last_sale_recording_date;
          record["Last Sale Recording Date Formatted"] =
            doc.distinct[0]["property"]?.["Last Sale Recording Date Formatted"];
          record["Last Sale Amount"] =
            doc.distinct[0]["property"]?.["Last Sale Amount"];
          record["Est Value"] = doc.distinct[0]["property"]?.["Est Value"];
          record["Est Equity"] = doc.distinct[0]["property"]?.["Est Equity"];
          record["Effective Year Built"] =
            doc.distinct[0]["property"]?.["Effective Year Built"];
          record["yearBuilt"] = doc.distinct[0]["property"]?.["yearBuilt"];
          record["vacancy"] = doc.distinct[0]["property"]?.["vacancy"];
          record["vacancyDate"] = doc.distinct[0]["property"]?.["vacancyDate"];
          record["parcel"] = doc.distinct[0]["property"]?.["parcel"];
          record["descbldg"] = doc.distinct[0]["property"]?.["descbldg"];
          record["listedPrice"] = doc.distinct[0]["property"]?.["listedPrice"];
          record["listedPriceType"] =
            doc.distinct[0]["property"]?.["listedPriceType"];
          (record["listedPrice1"] =
            doc.distinct[0]["property"]?.["listedPrice1"]),
            (record["listedPriceType1"] =
              doc.distinct[0]["property"]?.["listedPriceType1"]),
            (record["sold"] = doc.distinct[0]["property"]?.["sold"]),
            (record["Sold Date"] = doc.distinct[0]["property"]?.["Sold Date"]),
            (record["soldAmount"] =
              doc.distinct[0]["property"]?.["soldAmount"]),
            (record["improvval"] = doc.distinct[0]["property"]?.["improvval"]);
          record["ll_bldg_footprint_sqft"] =
            doc.distinct[0]["property"]?.["ll_bldg_footprint_sqft"];
          record["ll_bldg_count"] =
            doc.distinct[0]["property"]["ll_bldg_count"];
          record["legaldesc"] = doc.distinct[0]["property"]["legaldesc"];
          record["sqft"] = doc.distinct[0]["property"]["sqft"];
          record["sqftlot"] = doc.distinct[0]["property"]["sqftlot"];
          record["bedrooms"] = doc.distinct[0]["property"]["bedrooms"];
          record["bathrooms"] = doc.distinct[0]["property"]["bathrooms"];
          record["ll_gisacre"] = doc.distinct[0]["property"]["ll_gisacre"];
          record["lbcs_activity_desc"] =
            doc.distinct[0]["property"]["lbcs_activity_desc"];
          record["lbcs_function_desc"] =
            doc.distinct[0]["property"]["lbcs_function_desc"];
          record["livingarea"] = doc.distinct[0]["property"]["livingarea"];
          record["assessmentyear"] =
            doc.distinct[0]["property"]["assessmentyear"];
          record["assedvalschool"] =
            doc.distinct[0]["property"]["assedvalschool"];
          record["assedvalnonschool"] =
            doc.distinct[0]["property"]["assedvalnonschool"];
          record["taxvalschool"] = doc.distinct[0]["property"]["taxvalschool"];
          record["taxvalnonschool"] =
            doc.distinct[0]["property"]["taxvalnonschool"];
          record["justvalhomestead"] =
            doc.distinct[0]["property"]["justvalhomestead"];
          record["effyearbuilt"] = doc.distinct[0]["property"]["effyearbuilt"];
          record["Toal Open Loans"] =
            doc.distinct[0]["property"]["Toal Open Loans"];
          record["Lien Amount"] = doc.distinct[0]["property"]["Lien Amount"];
          record["Est. Remaining balance of Open Loans"] =
            doc.distinct[0]["property"]["Est. Remaining balance of Open Loans"];
          record["Tax Lien Year"] =
            doc.distinct[0]["property"]["Tax Lien Year"];
          record["propertyFrom"] = doc.distinct[0]["property"]["propertyFrom"];
          record["properties"] = doc.distinct.map((arr: any) => arr.property);
          record["count"] = doc.count;
          records.push(record);
        }
        console.log("------------- length ------------- ", records.length);
        return {
          success: true,
          data: JSON.stringify(records),
          count,
        };
      } else {
        return {
          success: false,
          error: validate.err,
        };
      }
    },
  },
  Mutation: {},
};
