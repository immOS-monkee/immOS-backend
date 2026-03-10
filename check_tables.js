const supabase = require('./src/config/supabase');

async function listTables() {
    console.log('--- Checking Database Tables ---');
    const { data, error } = await supabase.rpc('get_tables_info'); // This might fail if RPC doesn't exist

    // Fallback: system query
    const { data: tables, error: e2 } = await supabase
        .from('pg_catalog.pg_tables') // Usually not allowed via anon key
        .select('tablename')
        .eq('schemaname', 'public');

    if (e2) {
        console.log('Cannot list tables via standard query. Trying one-by-one check...');
        const check = async (name) => {
            const { error } = await supabase.from(name).select('id').limit(1);
            console.log(`Table "${name}": ${error ? 'MISSING (' + error.message + ')' : 'EXISTS'}`);
        };
        await check('usuarios');
        await check('mensajes');
        await check('leads');
        await check('propiedades');
        await check('chat_grupal_interno');
    } else {
        console.log('Tables found:', tables.map(t => t.tablename).join(', '));
    }
}

listTables();
