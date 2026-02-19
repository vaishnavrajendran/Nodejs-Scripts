import * as crypto from "crypto";
import axios from "axios";
import { URLSearchParams } from "url";

const config = {
  key: "HWZNQDPXW",
  salt: "5ENRQR9QO",
  env: "test",
  enable_iframe: 0
};

function sha512(str) {
  return crypto.createHash("sha512").update(str).digest("hex");
}

function validate_mail(mail) {
  if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail)) {
    return true;
  }
  return false;
}

function validate_phone(number) {
  if (number.length === 10) {
    return true;
  }
  return false;
}

function isFloat(amt) {
  var regexp = /^\d+\.\d{1,2}$/;
  return regexp.test(amt);
}

function generateHash(data, config) {
  var hashstring =
    config.key +
    "|" +
    data.txnid +
    "|" +
    data.amount +
    "|" +
    data.productinfo +
    "|" +
    data.name +
    "|" +
    data.email +
    "|" +
    data.udf1 +
    "|" +
    data.udf2 +
    "|" +
    data.udf3 +
    "|" +
    data.udf4 +
    "|" +
    data.udf5 +
    "|" +
    data.udf6 +
    "|" +
    data.udf7 +
    "|" +
    data.udf8 +
    "|" +
    data.udf9 +
    "|" +
    data.udf10;
  hashstring += "|" + config.salt;
  console.log("Hash String:", hashstring);
  return sha512(hashstring);
}

async function initiatePayment() {
  const data = {
    txnid: "TXN-" + crypto.randomUUID().split("-")[0],
    amount: "100.00",
    name: "John",
    email: "john@example.com",
    phone: "6282545847",
    productinfo: "HighwayDelite",
    surl: "https://www.highwaydelite.com",
    furl: "https://www.highwaydelite.com",
    udf1: "",
    udf2: "",
    udf3: "",
    udf4: "",
    udf5: "",
    udf6: "",
    udf7: "",
    udf8: "",
    udf9: "",
    udf10: "",
    unique_id: "",
    split_payments: "",
    sub_merchant_id: "",
    customer_authentication_id: ""
  };

  if (!data.name.trim())
    console.error("Mandatory Parameter name can not empty");
  if (!data.amount.trim() || !isFloat(data.amount))
    console.error("Mandatory Parameter amount failure");
  if (!data.txnid.trim())
    console.error("Merchant Transaction validation failed");
  if (!data.email.trim() || !validate_mail(data.email))
    console.error("Email validation failed");
  if (!data.phone.trim() || !validate_phone(data.phone))
    console.error("Phone validation failed");
  if (!data.productinfo.trim())
    console.error("Mandatory Parameter Product info cannot be empty");
  if (!data.surl.trim() || !data.furl.trim())
    console.error("Mandatory Parameter Surl/Furl cannot be empty");

  const hash_key = generateHash(data, config);
  console.log("Hash Key:", hash_key);

  let url_link = "";
  if (config.env == "prod") {
    url_link = "https://pay.easebuzz.in/";
  } else {
    url_link = "https://testpay.easebuzz.in/";
  }
  const call_url = url_link + "payment/initiateLink";

  const form = {
    key: config.key,
    txnid: data.txnid,
    amount: data.amount,
    email: data.email,
    phone: data.phone,
    firstname: data.name,
    udf1: data.udf1,
    udf2: data.udf2,
    udf3: data.udf3,
    udf4: data.udf4,
    udf5: data.udf5,
    hash: hash_key,
    productinfo: data.productinfo,
    udf6: data.udf6,
    udf7: data.udf7,
    udf8: data.udf8,
    udf9: data.udf9,
    udf10: data.udf10,
    furl: data.furl,
    surl: data.surl
  };

  if (data.unique_id) form.unique_id = data.unique_id;
  if (data.split_payments) form.split_payments = data.split_payments;
  if (data.sub_merchant_id) form.sub_merchant_id = data.sub_merchant_id;
  if (data.customer_authentication_id)
    form.customer_authentication_id = data.customer_authentication_id;

  const encodedParams = new URLSearchParams();
  for (const key in form) {
    encodedParams.append(key, form[key]);
  }

  try {
    const response = await axios.post(call_url, encodedParams, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      }
    });

    console.log("Response:", response.data);

    if (response.data && response.data.data) {
      const access_key = response.data.data;
      const payment_url = url_link + "pay/" + access_key;
      console.log("Payment URL:", payment_url);
    }
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
  }
}

initiatePayment();
