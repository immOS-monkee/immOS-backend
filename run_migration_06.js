const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function runMigration06() {
    console.log("🔧 Ejecutando migración 06: Añadiendo columna propietario_usuario_id...");

    try {
        // Supabase JS client doesn't support raw DDL directly.
        // We use the rpc or a workaround: try to insert to check column, or use Supabase dashboard.
        // Best approach here: execute via Supabase's REST with service key.
        const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                sql: `ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS propietario_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS idx_propiedades_propietario_usuario ON propiedades(propietario_usuario_id);`
            })
        });

        if (!response.ok) {
            // rpc/exec_sql may not exist, fallback: try to select the column
            console.log("⚠️  exec_sql RPC no disponible. Intentando verificar columna existente...");
            
            const { data, error } = await supabase
                .from('propiedades')
                .select('propietario_usuario_id')
                .limit(1);

            if (error && error.message.includes('column') && error.message.includes('propietario_usuario_id')) {
                console.error("❌ La columna 'propietario_usuario_id' NO existe en la tabla 'propiedades'.");
                console.error("   Por favor, ejecuta manualmente el archivo:");
                console.error("   database/migrations/06_add_propietario_usuario_id.sql");
                console.error("   en el Editor SQL del dashboard de Supabase.");
            } else {
                console.log("✅ La columna 'propietario_usuario_id' ya existe o fue creada.");
            }
        } else {
            console.log("✅ Migración 06 aplicada exitosamente.");
        }
    } catch (e) {
        console.error("❌ Error de red:", e.message);
        console.log("   Ejecuta manualmente: database/migrations/06_add_propietario_usuario_id.sql");
    }
}

runMigration06();
