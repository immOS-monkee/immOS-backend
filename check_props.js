const supabase = require('./src/config/supabase');

async function checkProps() {
    try {
        const { data, count, error } = await supabase
            .from('propiedades')
            .select('*', { count: 'exact' });

        if (error) {
            console.error('Error in Supabase query:', error);
            return;
        }

        console.log('--- DATABASE CHECK ---');
        console.log('Total properties in DB:', count);
        const disponibles = data.filter(p => p.estado === 'disponible');
        console.log('Properties with status "disponible":', disponibles.length);

        if (disponibles.length > 0) {
            console.log('Sample "disponible" property:', {
                id: disponibles[0].id,
                direccion: disponibles[0].direccion,
                estado: disponibles[0].estado
            });
        }
        console.log('----------------------');
    } catch (e) {
        console.error('Execution error:', e);
    }
}

checkProps();
