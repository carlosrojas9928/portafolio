'use client';
// frontend/src/app/(dashboard)/products/page.tsx (extracto)
// Tabla de productos: los que tienen stock <= stock mínimo se marcan con la
// insignia naranja "bajo" (el naranja se usa solo para alertas de stock).

interface Product {
  id: string;
  name: string;
  price: string;
  stock: number;
  minStock: number;
  location: string | null;
  category: { id: string; name: string } | null;
}

// ...dentro del componente ProductsPage (products: Product[] cargados con api.get('/products'))
<table className="tbl-b">
  <thead>
    <tr>
      <th>Producto</th>
      <th>Categoría</th>
      <th>Precio</th>
      <th>Stock</th>
      <th>Ubicación</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {products.map((p) => {
      const isLow = p.stock <= p.minStock;
      return (
        <tr key={p.id}>
          <td style={{ fontWeight: 600 }}>{p.name}</td>
          <td>{p.category?.name ?? <span className="faint">—</span>}</td>
          <td>${Number(p.price).toLocaleString('es-CO')}</td>
          <td>
            <span className={`bdg ${isLow ? 'bdg-w' : 'bdg-n'}`}>
              {p.stock} {isLow && '· bajo'}
            </span>
          </td>
          <td>{p.location ?? <span className="faint">—</span>}</td>
          <td>
            <button className="btn-lnk" onClick={() => setMovementFor(p)}>
              Registrar movimiento
            </button>
          </td>
        </tr>
      );
    })}
  </tbody>
</table>
