# MarketOps Backend v0.6

Agrega RadarCandidate, SupplierOffer e InvestmentRecommendation, con MarketScore, SupplierScore, costo puesto y Investment Engine.


## v0.7 Auto Discovery real
Fuentes Mercado Libre oficiales:
- `/trends/MLM`
- `/sites/MLM/search`
- `/sites/MLM/domain_discovery/search`

El sistema guarda `MarketSnapshot` por keyword y crea/actualiza `RadarCandidate`.
No interpreta `available_quantity` como ventas reales.
Si Mercado Libre no está autenticado, el Auto Discovery queda bloqueado y visible como `AUTH_REQUIRED`.


## v0.8 Supplier Discovery
Proveedor de búsqueda: Brave Search API.

- Busca proveedores/mayoristas/distribuidores/fabricantes/importadores.
- Guarda `SupplierLead`.
- `PriceHint` solo es un indicio extraído de snippets y NO se usa automáticamente como cotización.
- Un lead debe convertirse manualmente en `SupplierOffer` con precio/MOQ/envío verificados.
- El Investment Engine solo trabaja con ofertas/cotizaciones, no con leads sin verificar.

Env:
`BRAVE_SEARCH_API_KEY=`


## v0.9 Portfolio Engine
Distribuye capital entre recomendaciones BUY/TEST persistidas:
- reserva configurable (default 40%)
- máximo por producto (default 25% del capital)
- máximo de productos (default 5)
- ranking combina score + ROI estimado
- TEST reduce exposición inicial
- calcula inversión, reserva, utilidad potencial y nivel de riesgo


## v0.10 Replenishment & Exit Engine
Usa ventas reales e inventario para decidir:
- REORDER: reabastecer
- HOLD: mantener
- STOP: no invertir más
- EXIT: salir/liquidar

Se basa en:
- ventas de una ventana configurable
- venta diaria promedio
- días de cobertura
- lead time
- safety stock
- margen real
- días restantes de temporada


## v0.11 Learning Engine
Compara predicción vs resultado real:
- precio predicho vs precio promedio real
- margen predicho vs margen real
- rotación predicha vs rotación real
- sell-through
- score de precisión
- ajuste de confianza

El histórico modifica como máximo una parte pequeña del score futuro para evitar sobreajuste.

## v0.11.2 UX/API fixes
- `PATCH /api/capital` actualiza presupuesto y efectivo manteniendo compromisos.
- `PATCH /api/products/:productId` edita producto/precio.
- `DELETE /api/products/:productId` desactiva el producto sin borrar historial.
- `GET /api/products?includeInactive=true&search=...` permite administración completa.
