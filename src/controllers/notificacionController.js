const supabase = require('../config/supabase');

// List notifications for current user
exports.getMisNotificaciones = async (req, res) => {
    try {
        const { data: notificaciones, error } = await supabase
            .from('notificaciones')
            .select('*')
            .eq('usuario_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(notificaciones);
    } catch (error) {
        console.error('Get Notificaciones Error:', error);
        res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
};

// Mark single notification as read
exports.marcarLeida = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('notificaciones')
            .update({ leida: true })
            .eq('id', id)
            .eq('usuario_id', req.user.id);

        if (error) throw error;
        res.json({ message: 'Notificación marcada como leída' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar notificación' });
    }
};

// Mark all as read
exports.leerTodas = async (req, res) => {
    try {
        const { error } = await supabase
            .from('notificaciones')
            .update({ leida: true })
            .eq('usuario_id', req.user.id)
            .eq('leida', false);

        if (error) throw error;
        res.json({ message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar notificaciones' });
    }
};

// Delete notification
exports.eliminar = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('notificaciones')
            .delete()
            .eq('id', id)
            .eq('usuario_id', req.user.id);

        if (error) throw error;
        res.json({ message: 'Notificación eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar notificación' });
    }
};

// Helper for other controllers to create notifications
exports.crearInterno = async (usuario_id, titulo, mensaje, tipo = 'info', metadata = {}) => {
    try {
        const { data, error } = await supabase
            .from('notificaciones')
            .insert([{
                usuario_id,
                titulo,
                mensaje,
                tipo,
                metadata,
                leida: false,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating internal notification:', error);
        return null;
    }
};
