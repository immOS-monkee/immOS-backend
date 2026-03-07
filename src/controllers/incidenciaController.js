const supabase = require('../config/supabase');

exports.createIncidencia = async (req, res) => {
    try {
        const { propiedad_id, descripcion, prioridad } = req.body;
        const reportado_por = req.user.id;

        const { data: incidencia, error } = await supabase
            .from('incidencias')
            .insert([{
                propiedad_id,
                reportado_por,
                descripcion,
                prioridad: prioridad || 'media',
                estado: 'abierta'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Incidencia reportada', incidencia });
    } catch (error) {
        console.error('Create Incidencia Error:', error);
        res.status(500).json({ error: 'Error al reportar incidencia' });
    }
};

exports.getIncidencias = async (req, res) => {
    try {
        const { propiedad_id } = req.query;
        let query = supabase.from('incidencias').select(`
            *,
            propiedades (direccion),
            reportado_por:usuarios (nombre)
        `);

        if (propiedad_id) query = query.eq('propiedad_id', propiedad_id);

        const { data: incidencias, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json(incidencias);
    } catch (error) {
        console.error('List Incidencias Error:', error);
        res.status(500).json({ error: 'Error al listar incidencias' });
    }
};

exports.updateIncidencia = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, costo_estimado } = req.body;

        const { data: incidencia, error } = await supabase
            .from('incidencias')
            .update({ estado, costo_estimado })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Incidencia actualizada', incidencia });
    } catch (error) {
        console.error('Update Incidencia Error:', error);
        res.status(500).json({ error: 'Error al actualizar incidencia' });
    }
};
