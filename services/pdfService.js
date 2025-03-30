const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const certsDir = path.join(__dirname, '../certificates');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const generateCertificatePDF = (certificate) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const fileName = `${certificate.licensePlate}_${Date.now()}.pdf`;
      const filePath = path.join(certsDir, fileName);
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ✅ **Unicode shrift yuklash**
      doc.font('fonts/DejaVuSans.ttf');

      doc.fontSize(20).text('СЕРТИФИКАТ ТРАНСПОРТНОГО СРЕДСТВА', { align: 'center' });
      doc.moveDown();

      doc.fontSize(14).text(`Номер сертификата: ${certificate._id}`);
      doc.text(`Дата выдачи: ${moment(certificate.approvedAt).format('DD.MM.YYYY')}`);
      doc.moveDown();

      doc.font('fonts/DejaVuSans.ttf').fontSize(14).text('Данные транспортного средства:', { underline: true });
      doc.text(`Марка: ${certificate.carBrand}`);
      doc.text(`Модель: ${certificate.carModel}`);
      doc.text(`Госномер: ${certificate.licensePlate}`);
      doc.text(`VIN: ${certificate.vin}`);
      doc.moveDown();

      doc.font('fonts/DejaVuSans.ttf').text('Данные оператора:', { underline: true });
      doc.text(`ФИО: ${certificate.operatorId.firstName} ${certificate.operatorId.lastName || ''}`);
      doc.text(`Дата создания: ${moment(certificate.createdAt).format('DD.MM.YYYY HH:mm')}`);
      doc.moveDown();

      doc.text('_________________________', 350, 650);
      doc.text('Подпись администратора', 350, 670);

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateCertificatePDF };
