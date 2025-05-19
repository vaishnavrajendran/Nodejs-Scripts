const axios = require("axios");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const fetchCaptchaAndRunOCR = async () => {
  try {
    // 1. Fetch image
    const response = await axios.get(
      "https://www.npci.org.in/netc_api/netc_fasttag/file",
      {
        responseType: "arraybuffer",
        headers: {
          accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "accept-language": "en-GB,en;q=0.9",
          priority: "i",
          referer:
            "https://www.npci.org.in/what-we-do/netc-fastag/check-your-netc-fastag-status",
          "sec-ch-ua":
            '"Chromium";v="134", "Not:A-Brand";v="24", "Brave";v="134"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "image",
          "sec-fetch-mode": "no-cors",
          "sec-fetch-site": "same-origin",
          "sec-gpc": "1",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          Cookie:
            "ASP.NET_SessionId=2b5lba4boudkx4hsaurf4ybs; __RequestVerificationToken=OwfKMqz8MlNKKEG_nPzsh3g2BgH5iCPi9sw1fhV3DN-8M9JQZRe8mUqswIQ8Abdj9UBv06chOmuPk2yqT5f4HHPijnbg-iNMtVXWT2rWXAE1",
        },
      }
    );

    // 2. Convert to base64 and log (for testing)
    const contentType = response.headers["content-type"] || "image/png";
    const base64 = Buffer.from(response.data, "binary").toString("base64");
    const base64Image = `data:${contentType};base64,${base64}`;
    console.log("Base64 Image:", base64Image);

    // 3. Process image from buffer
    const processedBuffer = await sharp(Buffer.from(response.data))
      .grayscale()
      .threshold(150)
      .toBuffer();

    // 4. OCR from processed buffer
    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, "eng", {
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    });

    const cleaned = text.replace(/[^\w]/g, "");
    console.log("Detected Text:", cleaned);
  } catch (error) {
    console.error("Error:", error.message);
  }
};

fetchCaptchaAndRunOCR();
