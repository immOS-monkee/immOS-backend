const supabase = require('../config/supabase');
const winston = require('winston');

// 1. Obtener configuración por clave (Público)
exports.getConfigByClave = async (req, res) => {
    try {
        const { clave } = req.params;
        const { data, error } = await supabase
            .from('configuracion_global')
            .select('valor')
            .eq('clave', clave)
            .single();

        if (error) {
            winston.error(`Error obteniendo config ${clave}:`, error);
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        return res.json(data);
    } catch (err) {
        winston.error('Error en getConfigByClave:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// 2. Actualizar configuración (Protegido - Admin/Marketing)
exports.updateConfig = async (req, res) => {
    try {
        const { clave } = req.params;
        const { valor } = req.body;

        if (valor === undefined) {
            return res.status(400).json({ error: 'El valor es obligatorio' });
        }

        const { data, error } = await supabase
            .from('configuracion_global')
            .update({
                valor,
                updated_at: new Date()
            })
            .eq('clave', clave)
            .select();

        if (error) throw error;

        return res.json({
            success: true,
            message: `Configuración ${clave} actualizada correctamente`,
            data: data[0]
        });
    } catch (err) {
        winston.error(`Error actualizando config ${clave}:`, err);
        return res.status(500).json({ error: 'Error al actualizar la configuración' });
    }
};
