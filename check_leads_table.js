const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function checkTable() {
    try {
        console.log('Verificando tabla leads_web...');
        const { data, error } = await supabase
            .from('leads_web')
            .select('*')
            .limit(1);

        if (error) {
            console.error('❌ Error al acceder a la tabla:', error.message);
            if (error.message.includes('relation "leads_web" does not exist')) {
                console.log('💡 La tabla "leads_web" NO existe.');
            }
        } else {
            console.log('✅ La tabla "leads_web" existe.');
            console.log('Ejemplo de datos (si hay):', data);
        }
    } catch (err) {
        console.error('❌ Error inesperado:', err.message);
    }
}

checkTable();
