const supabase = require('./src/config/supabase');

async function debugProp() {
    const id = '0fbf8cbd-fd7a-4a5d-a011-61fed648bd30';
    try {
        const { data, error } = await supabase
            .from('propiedades')
            .select('*, multimedia_propiedad(*)')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error in Supabase query:', error);
            return;
        }

        console.log('--- PROPERTY DEBUG ---');
        console.log('ID:', data.id);
        console.log('Direccion:', data.direccion);
        console.log('Multimedia count:', data.multimedia_propiedad?.length || 0);
        if (data.multimedia_propiedad?.length > 0) {
            data.multimedia_propiedad.forEach((m, idx) => {
                console.log(`[${idx}] Order: ${m.orden}, URL: ${m.url}`);
            });
        }
        console.log('----------------------');
    } catch (e) {
        console.error('Execution error:', e);
    }
}

debugProp();
