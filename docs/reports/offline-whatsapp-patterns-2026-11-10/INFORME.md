# VELTIA: pruebas offline a partir de patrones de WhatsApp

Fecha: 10 de noviembre de 2026. Equipo: Mac autorizado del usuario.
Repositorio: `/Users/gomez/Documents/WhatsappVELTIA`.
Commit base: `69ca029c5715439e5b7616142a34cf1b99bd1d58`.

## Resultado

- Se revisaron fragmentos visibles de cinco conversaciones en WhatsApp Business autenticado en Safari: una de sandbox y cuatro comerciales.
- Se crearon **16 pruebas nuevas**, todas aprobadas.
- Suite completa final: **1212/1212 aprobadas**, sin fallos ni omitidas, en 7,87 segundos.
- Cero llamadas a OpenAI, mensajes enviados, escrituras productivas o cambios al catálogo real.
- No se modificaron `src/`, `server.js`, dependencias, configuración, cuentas ni integraciones. No se hizo commit, push ni despliegue.

## Qué se aprovechó de las conversaciones

Solo patrones de interacción, reformulados con productos, precios y mensajes inventados:

1. Aplazar una decisión o mencionar una compra hipotética no equivale a confirmar.
2. Preguntar cuántas piezas contiene un paquete no cambia la cantidad comprada.
3. Una corrección de color, etapa o talla puede requerir más evidencia; no autoriza elegir un SKU por intuición.
4. Un texto que anuncia un comprobante no demuestra que el pago esté verificado.
5. Una nueva imagen o consulta debe conservar su propia identidad y disponibilidad, sin reutilizar automáticamente la anterior.
6. Agradecimientos, fechas tentativas y preguntas sobre pago no deben cerrar un pedido.
7. La cotización debe respetar las presentaciones y precios del catálogo, y una presentación inexistente no debe alterar un carrito válido.
8. Una instrucción afirmativa de pago puede retomar la selección pendiente, sin duplicarla ni confirmar prematuramente.
9. El estado de distintos compradores debe permanecer aislado.

La lectura del sandbox también mostró una pérdida histórica de contexto al pasar de producto cotizado a datos de entrega. El repositorio ya contiene regresiones para esa continuidad y pasan en la suite actual. La conversación antigua no demuestra por sí sola que la versión actual siga fallando.

## Privacidad y aislamiento

No se copiaron transcripciones ni se guardaron nombres de clientes, contactos, direcciones, cuentas bancarias, imágenes, audios o precios reales. No se descargaron adjuntos. El corpus es de creación sintética, no una exportación saneada de conversaciones.

Las pruebas usan el harness local existente, con persistencia en memoria, catálogo ficticio, intérprete semántico escrito a mano y humanizador que devuelve la respuesta base. El sistema operativo bloqueó la red y la lectura del `.env`. Se verificaron bloqueos EPERM. El entorno del proceso se limpió con `env -i`. En la suite completa solo se permitieron los archivos temporales `catalogo-*.json` que necesitan pruebas ya existentes.

Las comprobaciones por patrones para correo, enlaces o números largos son controles auxiliares. No garantizan anonimizar transcripciones arbitrarias. Por eso no se usaron chats reales como fixtures.

## Qué prueba y qué no prueba

Las pruebas verifican invariantes del motor, validación de catálogo, conservación del carrito y aislamiento cuando la interpretación semántica suministrada es correcta. **No prueban que OpenAI entienda estas frases, imágenes o audios**, ni que el humanizador redacte correctamente, que el pago esté conciliado o que el flujo WhatsApp completo funcione. No se han reentrenado modelos.

La siguiente validación con IA, cuando haya créditos y autorización, debe medir interpretación, referencias visuales, respuestas y ambigüedades por separado. El material nuevo ya está preparado para utilizarse sin datos de clientes.

## Archivos

- `test/whatsappObservedPatternsOffline.test.js`: 16 pruebas.
- `docs/reports/offline-whatsapp-patterns-2026-11-10/synthetic-corpus.json`: 10 escenarios lingüísticos sintéticos y catálogo ficticio.
- `docs/reports/offline-whatsapp-patterns-2026-11-10/results.json`: métricas y garantías de ejecución.
- Este informe.

## Repetir solo las pruebas nuevas en el Mac

Desde la raíz del repositorio:

```sh
env -i PATH=/usr/local/bin:/usr/bin:/bin TMPDIR=/tmp   /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*) (deny file-read* (literal "/Users/gomez/Documents/WhatsappVELTIA/.env")) (deny file-write*)'   /usr/local/bin/node --test --test-reporter=spec test/whatsappObservedPatternsOffline.test.js
```

El comando requiere que macOS permita iniciar este sandbox. No reemplazarlo por los scripts de validación live: algunos cargan `.env` y llaman a OpenAI.
