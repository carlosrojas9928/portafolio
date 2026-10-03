// backend/src/reports/reports.service.ts (extracto)
// Reporte de inventario en Excel (ExcelJS): encabezado verde de marca y filas
// con stock bajo resaltadas en naranja suave. El PDF usa los mismos datos.
import * as ExcelJS from 'exceljs';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF166B48' }, // verde de Stok.io
};
const LOW_STOCK_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4D6' }, // tono suave del naranja de alerta
};

async generateInventoryExcel(businessId: string): Promise<ExcelJS.Buffer> {
  const products = await this.prisma.product.findMany({
    where: { businessId },
    include: { category: true },
    orderBy: { name: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Stok.io';
  const sheet = workbook.addWorksheet('Inventory', {
    views: [{ state: 'frozen', ySplit: 1 }], // encabezado fijo al hacer scroll
  });

  sheet.columns = [
    { header: 'Product', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Price', key: 'price', width: 15 },
    { header: 'Stock', key: 'stock', width: 12 },
    { header: 'Min. stock', key: 'minStock', width: 12 },
    { header: 'Location', key: 'location', width: 20 },
  ];
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  for (const product of products) {
    const row = sheet.addRow({
      name: product.name,
      category: product.category?.name ?? '—',
      price: Number(product.price),
      stock: product.stock,
      minStock: product.minStock,
      location: product.location ?? '—',
    });
    if (product.stock <= product.minStock) {
      row.eachCell((cell) => (cell.fill = LOW_STOCK_FILL));
    }
  }

  sheet.autoFilter = { from: 'A1', to: 'F1' };
  return workbook.xlsx.writeBuffer();
}
