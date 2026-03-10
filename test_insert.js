const supabase = require('./src/config/supabase');

async function testInsert() {
    const email = `test_propietario_${Date.now()}@inmoos.com`;
    console.log("Intentando insertar propietario:", email);
    
    // Test owner insert
    const paramPropietario = {
        email: email,
        password_hash: 'dummyhash',
        nombre: 'Test Propietario',
        rol: 'propietario' // El rol que está fallando según el reporte
    };

    const resProp = await supabase.from('usuarios').insert([paramPropietario]);
    console.log("Respuesta Propietario:", JSON.stringify(resProp, null, 2));

    // Test client insert to confirm enum value ('cliente' vs 'comprador')
    const emailCli = `test_cliente_${Date.now()}@inmoos.com`;
    const paramCliente = {
        email: emailCli,
        password_hash: 'dummyhash',
        nombre: 'Test Cliente',
        rol: 'cliente' // Este valor envía el frontend actualmente
    };
    const resCli = await supabase.from('usuarios').insert([paramCliente]);
    console.log("\nRespuesta Cliente:", JSON.stringify(resCli, null, 2));
}

testInsert();
