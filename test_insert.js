const supabase = require('./src/config/supabase');

async function testInsert() {
    try {
        console.log("Testing insert...");
        const res = await supabase
            .from('propiedades')
            .insert([{
                direccion: 'Test',
                tipo_propiedad: 'piso',
                operacion: 'venta',
                precio_venta: null, // this might fail if required?
                precio_alquiler: null,
                caracteristicas: {},
                estado: 'disponible'
            }])
            .select();
        console.log("Response:", res);
    } catch (e) {
        console.error("Exception:", e);
    }
}

testInsert();
