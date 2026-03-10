const supabase = require('../config/supabase');
const winston = require('winston');

// 1. Recibir Lead desde el formulario público (No requiere JWT)
exports.crearLeadPublico = async (req, res) => {
    try {
        const { nombre, telefono, descripcion_busqueda, zona_interes, origen } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'Nombre y WhatsApp son obligatorios' });
        }

        const { data, error } = await supabase
            .from('leads_web')
            .insert([{
                nombre,
                telefono,
                descripcion_busqueda,
                zona_interes,
                origen: origen || 'Otro',
                estado: 'nuevo'
            }])
            .select();

        if (error) throw error;

        // Podríamos enviar notificación en tiempo real aquí usando el canal de notificaciones

        return res.status(201).json({
            success: true,
            message: 'Lead registrado correctamente, contacto en breve.',
            lead: data[0]
        });

    } catch (err) {
        winston.error('Error al crear Lead Público:', err);
        return res.status(500).json({ error: 'Fallo al procesar el formulario de contacto' });
    }
};

// 2. Obtener Leads para el Dashboard de Marketing (Requiere JWT)
exports.obtenerLeads = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leads_web')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        winston.error('Error al obtener Leads Web:', err);
        return res.status(500).json({ error: 'Error interno de servidor' });
    }
};

// 3. Actualizar estado del Lead (Contactado, Convertido, etc)
exports.actualizarEstadoLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, asignado_a } = req.body;

        const { data, error } = await supabase
            .from('leads_web')
            .update({ estado, asignado_a, updated_at: new Date() })
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json(data[0]);
    } catch (err) {
        winston.error('Error al actualizar estado Lead:', err);
        return res.status(500).json({ error: 'Error interno de servidor' });
    }
};
