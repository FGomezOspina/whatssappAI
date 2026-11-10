# Ampliación del 30 de octubre de 2026

Corte de conversaciones: 00:00–09:35:19 America/Bogota (05:00–14:35:19 UTC). Cuatro chats de clientes revisados; uno de coordinación comercial excluido. Cobertura parcial. Las versiones v1 y v2 del corpus son inmutables y separadas del corpus del 28–29.

## Qué se prueba

`today-corpus-v2.json` conserva secuencias de origen anonimizadas, lecturas manuales de píxeles visibles, contexto reconstruido, IDs esperados y brechas. Doce consultas del motor son reconstrucciones humanas, NO mensajes originales entregados a un intérprete ni pruebas de visión. Ocho imágenes se leyeron en vistas insertadas; una quedó borrosa. No se obtuvieron los nueve archivos originales. Un audio de cliente no se transcribió. Dos audios de coordinación están fuera del corpus de clientes.

La cantidad del pedido, la variante numérica y el peso son dimensiones distintas. El precio no participa en el gold ni la puntuación. Tamaños ofrecidos por el asesor no equivalen a tamaños elegidos por el cliente.

## Repetir sin red

```sh
node scripts/evaluation/replay-oct30-identity.js --before --v2 --output=/tmp/veltia-oct30-before-new.json
node scripts/evaluation/replay-oct30-identity.js --v2 --output=/tmp/veltia-oct30-after-new.json
npm test
```

Las salidas deben ser nuevas. El runner rechaza sobrescribirlas. Usa las mismas filas brutas de `raw-capture/catalog-rows.json`, nunca obtiene catálogo desde la red. El baseline carga copias guardadas antes de los cambios de esta ampliación, sin tocar archivos de producción. `before-v2.json` y `after-v3.json` son la comparación final; `after-v2.json` conserva la fase previa a la corrección de cuatro regresiones nominales descubiertas por el diagnóstico ampliado.

`raw-capture/catalog-evidence.json` registra fecha, tenant y paginación de la lectura Supabase. `catalog-after-v2.json` es derivado localmente de esas filas: 1069 entradas tras separar variantes, frente a1063 antes. No se reemplazó la captura congelada de octubre29.

## OpenAI futuro

Este runner solo admite ejecución local y rechaza `--provider=...`. No carga .env ni importa el intérprete. No tiene modo de enviar WhatsApp, generar pedidos o escribir Supabase.

El replay anterior `replay-frozen-business.js` mantiene sus barreras de opt-in y requiere autorización explícita de recarga, todavía NO concedida. Las mismas entradas de texto y expectativas quedan guardadas. Para probar los mismos medios de hoy se deben recuperar sus archivos originales y añadir un manifiesto multimedia nuevo con hashes, sin modificar v1/v2. Las lecturas manuales no deben pasarse como si fuesen imágenes originales o comprensión automática. El corte no debe ampliarse silenciosamente.

## Pendientes concretos

- Feline EN previo: no se guardó el antecedente literal; no inventar un caso multimensaje.
- Pro Plan UR lata: imagen156g pero catálogo solo «unidad»; falta correspondencia de presentación verificada.
- B-FEX jarabe: no localizado nominalmente en filas activas; no inventar equivalente.
- Royal Canin Urinary lata: asesor indica que no lo maneja, sin referencia húmeda encontrada; nunca sustituir por seco.
- Dermosyn/Alapiel: nombres y candidatos conocidos; forma farmacéutica ausente en catálogo. Mantener aclaración útil.
- Gotas T04: foto ilegible; precio y conversación de envío no prueban identidad.
- Churu T02: color negativo no establece sabor ni paquete.
- Paginación: el scroll de Safari devolvió noWindowsAvailable; búsqueda directa y vista insertada parcialmente funcionales. Sin llamada pendiente, sin denegación de seguridad nueva.
