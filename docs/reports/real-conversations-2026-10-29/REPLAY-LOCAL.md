# Reproducción congelada, versión 1

Trabajo local final del 30 de octubre de 2026. No hubo llamadas a OpenAI, mensajes, pedidos, reinicios ni escrituras en Supabase. El informe Library se actualiza por separado; esta carpeta conserva evidencia local.

## Ejecutar ahora sin servicios

```sh
node scripts/evaluation/replay-frozen-business.js --output=/tmp/veltia-replay-local.json
npm test
```

`frozen-business-replay-v1.json` conserva 43 casos únicos y un snapshot identificado por SHA-256. No editar v1 para acomodar resultados: crear otra versión y documentar el cambio de evidencia. El generador usa escritura exclusiva y rechaza sobrescribir v1. Los fixtures originales también conservan sus hashes. `catalog.json` debe mantener su huella original.

El replay conserva exactamente las consultas del benchmark: algunas son fragmentos, reformulaciones de la cuenta comercial o reconstrucciones manuales. No fabrica historia estructurada a partir de las notas del auditor. Las notas, identidades esperadas y etiquetas no llegan al modelo. Salidas de la cuenta no prueban autoría humana. Los casos sintéticos están separados. Los 16 casos excluidos no se convierten en texto inventado ni simulaciones de percepción.

Resultado local real: 12 identificaciones, 14 abstenciones, una aclaración de formato (C16-01), 16 no evaluables y cero falsos positivos. La etiqueta histórica de C16-01 sigue dando `missed`; la nueva expectativa exige aclarar la forma del alimento. No es evaluación ciega ni precisión integral del agente.

## Ruta futura, todavía NO autorizada ni ejecutada

Solo después del aviso explícito del usuario de que recargó y autoriza la prueba, con la configuración de OpenAI existente disponible en el entorno, se puede invocar:

```sh
node scripts/evaluation/replay-frozen-business.js --provider=openai --allow-paid-openai --confirm-user-recharge --case=C01-01 --output=/tmp/veltia-replay-openai-C01-01.json
```

Las dos opciones no sustituyen el consentimiento del usuario. `--case=all` seleccionaría expresamente todos los casos evaluables y consumiría más tokens; no usarlo antes de acordar la ejecución. El script no carga `.env`, no cambia modelos, no llama WhatsApp ni Supabase y no procesa pedidos. La ruta de pago importa el intérprete después de comprobar las opciones, credencial y caso. Se detiene ante el primer fallo del intérprete. Los resultados de OpenAI deben guardarse aparte; nunca sobre el manifest ni sobre el resultado local congelado.

Esta ruta prueba únicamente intérprete + candidatos locales + validador. No sustituye pruebas del router completo, segmentación de mensajes, redactor, percepción real de imágenes/audio o carrito. Los originales multimedia faltan y requieren otra versión de evidencia antes de añadirlos. Ninguna ejecución futura queda programada automáticamente.

## Archivos de resultados

- `food-format-final-tests.txt`: 1.075 pruebas aprobadas, cero fallos.
- `frozen-replay-local.json`: replay final de los 43 casos, latencias locales y huellas.
- `media-resumption-before.json` y `media-resumption-after.json`: comparación histórica de la fase anterior; no sobrescribir.
- `catalog-canonical-before-collision.json` y `catalog-canonical-diagnostic.json`: consultas sintéticas de las 1.063 entradas agrupadas. Resultado final: 1.021 nombres recuperados, 42 aclaraciones, cero selecciones de otro nombre. No mide errores ortográficos arbitrarios ni la identidad de toda presentación.

La auditoría sigue limitada a 22 chats comerciales y un proveedor excluido. El 30 de octubre se verificó Safari, pero scroll por coordenadas y por accesibilidad volvió a fallar con `noWindowsAvailable`, incluso después de Raise sobre la ventana exacta. No hubo nueva paginación ni nuevos medios. No se repitieron denegaciones de aplicaciones nativas. No afirmar revisión exhaustiva.

## Revisión final posterior a Library v4

La suite final está en `clarification-review-tests.txt`: **1.082 aprobadas, cero fallos**. Los resultados v4 se conservaron y no se sobrescribió el corpus v1.

- `canonical-inputs-v2.json` congela 1.063 nombres comerciales sin atributos generados. `canonical-v2-before.json` y `canonical-v2-final.json` usan exactamente esas mismas consultas: 1.011 → 1.022 confirmaciones, 52 → 41 aclaraciones, cero selecciones de otro nombre en ambas ejecuciones.
- `clarification-review.json` revisa individualmente las 42 aclaraciones antiguas. Contiene 12 fallos evitables corregidos, 14 pesos corporales ausentes, seis mg/ml antes mal descritos como peso fuera de rango, cuatro familias ambiguas, dos registros con puntuación distinta, un mapeo de catálogo pendiente y tres entradas sintéticas defectuosas por CAN → lata. El resultado bruto conserva las dos selecciones distintas de su antigua expectativa en esas entradas defectuosas; no se maquillan como aciertos.
- `corpus-input-review.json` verifica que 43/43 entradas son idénticas a sus fixtures. No contiene ni afirma transcripciones completas. Las derivaciones manuales y el contexto omitido siguen explícitos.
- Feline EN conserva `missed` con la expectativa histórica de referencia confirmada. Su entrada congelada no incluye el antecedente de concentrado. Una reconstrucción manual separada resuelve la referencia, pero no prueba recuperación automática del historial antiguo.
- `frozen-replay-v5.json` conserva exactamente las decisiones del replay v4, con la misma huella del corpus. La nueva protección del runner rechaza sobrescribir cualquier archivo existente antes de importar el intérprete. Elegir siempre una salida nueva.
- `clarification-review-validation.json` contiene comprobaciones, conteos y latencia local. No se ejecutó OpenAI ni se interactuó con el navegador durante esta revisión adicional.
