# Ejecución de clasificación R4

El lote está listo para aplicar, pero todavía NO se ha aplicado a Supabase. Hay 374 referencias propuestas. Los campos dudosos se conservan; no deben resolverse por suposición antes de ejecutar.

1. Usar exclusivamente `apply-supabase.sql`, versión `clasificacion-20261028-r4`. Verificar su SHA-256 en `FINAL.json`. Las revisiones anteriores y el archivo candidate están retirados.
2. Ejecutar el archivo completo en el SQL Editor del proyecto correcto con un rol ya autorizado. No quitar guardas ni ejecutar fragmentos. No cambia permisos, RLS ni esquema permanente.
3. El script valida tenant Distrifinca, UUID, marca, estado previo completo y presentaciones; bloquea filas y modifica únicamente clasificación. Cualquier diferencia concurrente cancela todo el lote. Ante error, ejecutar `ROLLBACK;`, conservar el mensaje y volver a auditar el estado actual antes de generar otro lote.
4. El resultado final debe contener `referencias_verificadas = 374`, `lectura_posterior` y `rollback_sql`. Guardar las tres celdas completas fuera de la sesión del editor. La lectura posterior corresponde al estado realmente verificado dentro de la transacción.
5. La celda `rollback_sql` es el script completo de reversión, generado con los timestamps reales posteriores. Guardarlo como `rollback-clasificacion-r4.sql`; para revertir ejecutar su contenido completo. Rechaza cambios concurrentes y restaura clasificación, conservando precios, nombres, presentaciones y otros metadatos. El timestamp de actualización cambia de forma normal por el trigger. No existe un rollback estático equivalente con timestamps futuros desconocidos.

La misma aplicación no debe repetirse: abortará por estado previo divergente o tabla temporal existente. Si el editor pierde la conexión tras ejecutar, comprobar el resultado por UUID antes de reintentar; no asumir que falló. Los respaldos originales están en `productos.before.json` y `supabase.before.json`, con permisos 0600. Para restaurar localmente, comprobar primero que no haya modificaciones posteriores; no copiar el respaldo sobre trabajo concurrente.

Pruebas offline: 13 escenarios PostgreSQL/PGlite, incluido apply, rollback, concurrencia, precio, metadata, nueva presentación y tenant ajeno. No equivalen a una ejecución productiva. Supabase se leyó sin cambios respecto al respaldo el 2026-10-28T18:27:08.504Z. Las guardas comprueban de nuevo la vigencia al ejecutar.
