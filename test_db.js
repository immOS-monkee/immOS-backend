const supabase = require('./src/config/supabase');

async function testTables() {
    console.log('--- Testing Supabase Connection & Tables ---');

    console.log('1. Testing "mensajes" table (simple)...');
    const { data: m1, error: e1 } = await supabase.from('mensajes').select('id').limit(1);
    if (e1) console.error('Error in "mensajes" (simple):', e1.message);
    else console.log('OK: "mensajes" table found.');

    console.log('2. Testing "mensajes" with explicit joins...');
    const { data: m2, error: e2 } = await supabase
        .from('mensajes')
        .select('*, sender:usuarios!remitente_id(id, nombre), receiver:usuarios!destinatario_id(id, nombre)')
        .limit(1);
    if (e2) console.error('Error in "mensajes" (explicit joins):', e2.message);
    else console.log('OK: Explicit joins resolved correctly.');
}

testTables();
