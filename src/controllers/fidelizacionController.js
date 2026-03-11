const supabase = require('../config/supabase');
const logger = require('../utils/logger');

exports.getClientFidelityStatus = async (req, res) => {
    try {
        const { clientId } = req.params;

        // 1. Fetch closed deals with this client
        const { data: sales, error: sError } = await supabase
            .from('ofertas')
            .select('id, prop_id, updated_at, importe_final, tipo_operacion')
            .eq('comprador_id', clientId)
            .eq('estado', 'cerrada_exitosa');

        if (sError) throw sError;

        // 2. Map milestones (e.g., 1 year since last purchase)
        const milestones = sales.map(s => {
            const closedDate = new Date(s.updated_at);
            const today = new Date();
            const monthsSince = (today.getFullYear() - closedDate.getFullYear()) * 12 + (today.getMonth() - closedDate.getMonth());

            return {
                operacion_id: s.id,
                tipo: s.tipo_operacion,
                meses_transcurridos: monthsSince,
                proximo_hito: monthsSince < 12 ? '1er Aniversario' : 'Mantenimiento preventivo',
                fecha_cierre: s.updated_at
            };
        });

        res.json({
            success: true,
            cliente_id: clientId,
            operaciones_cerradas: sales.length,
            hoja_de_ruta: milestones
        });
    } catch (err) {
        logger.error('Fidelizacion Error:', err);
        res.status(500).json({ 
            error: 'Error al consultar fidelización del cliente',
            details: err.message,
            hint: err.hint,
            code: err.code
        });
    }
};

exports.registerSatisfactionSurvey = async (req, res) => {
    try {
        const { oferta_id, puntuacion, comentarios } = req.body;

        // Simple implementation: Update a potential 'satisfaccion' field in the oferta or a new table
        // For now, let's assume we update the metadata of the deal
        const { data, error } = await supabase
            .rpc('append_deal_metadata', {
                deal_id: oferta_id,
                meta_key: 'satisfaccion',
                meta_value: { puntuacion, comentarios, fecha: new Date().toISOString() }
            });

        if (error) throw error;

        res.json({ success: true, message: 'Gracias por tu feedback' });
    } catch (err) {
        logger.error('Survey Error:', err);
        res.status(500).json({ error: 'Error al registrar encuesta' });
    }
};
