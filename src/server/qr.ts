import QRCode from "qrcode";

/** QR sebagai SVG mandiri (hitam di atas putih) agar tetap terbaca pemindai di tema apa pun. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
