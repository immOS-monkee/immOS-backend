const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function runMigration() {
    console.log("Iniciando 'intervención quirúrgica' en base de datos...");

    // Al no poder ejecutar SQL puro fácilmente desde el cliente JS sin RPC,
    // usaremos el cliente para asegurar que el registro existe o crearlo.
    // La tabla debedía existir ya si el usuario ejecutó el SQL, pero por seguridad:

    try {
        const { error: insertError } = await supabase
            .from('configuracion_global')
            .upsert({
                clave: 'whatsapp_numero',
                valor: '34600000000',
                descripcion: 'Número central de atención vía WhatsApp'
            }, { onConflict: 'clave' });

        if (insertError) {
            if (insertError.message.includes('relation "configuracion_global" does not exist')) {
                console.error("❌ ERROR: La tabla 'configuracion_global' no existe. Por favor, ejecuta el script SQL 07_create_config_table.sql en el dashboard de Supabase.");
            } else {
                console.error("❌ ERROR inesperado:", insertError.message);
            }
        } else {
            console.log("✅ Configuración inicial de WhatsApp insertada/verificada en Supabase.");
        }
    } catch (e) {
        console.error("❌ Fallo en la comunicación con Supabase:", e.message);
    }
}

runMigration();
