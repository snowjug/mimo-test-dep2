function getPDFDocument() {
  return require("pdf-lib").PDFDocument;
}

module.exports = {
  getPDFDocument,
};
