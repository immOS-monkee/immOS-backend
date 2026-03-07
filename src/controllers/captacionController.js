const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');

exports.createCapture = async (req, res) => {
    try {
        const { data, offline_id } = req.body;
        const agente_id = req.user.id;

        if (!data || !data.telefono) {
            return res.status(400).json({ error: 'Datos incompletos. El teléfono es obligatorio.' });
        }

        // 1. Escudo Anti-Duplicados (Búsqueda preventiva)
        const { data: existing } = await supabase
            .from('captaciones_campo')
            .select('id, status, created_at, agente_id, usuarios(nombre)')
            .filter('data->>telefono', 'eq', data.telefono)
            .maybeSingle();

        if (existing) {
            const msg = existing.status === 'descartada'
                ? `⚠️ Esta propiedad ya fue descartada el ${new Date(existing.created_at).toLocaleDateString()}. No pierdas tiempo aquí.`
                : `⚠️ Esta propiedad ya está siendo gestionada por ${existing.usuarios?.nombre || 'otro agente'}.`;
            return res.status(409).json({ error: msg, existing });
        }

        const { data: capture, error } = await supabase
            .from('captaciones_campo')
            .insert([{
                agente_id,
                data,
                offline_id,
                status: 'nueva'
            }])
            .select()
            .single();

        if (error) throw error;

        await fireRules('captacion_nueva', {
            agente_id,
            entidad_id: capture.id,
            direccion: data.address || data.direccion,
            tipo: data.type || data.tipo
        });

        res.status(201).json({ message: 'Captación guardada exitosamente', capture });
    } catch (error) {
        console.error('Capture Error:', error);
        res.status(500).json({ error: 'Error al guardar la captación' });
    }
};

exports.getCaptures = async (req, res) => {
    try {
        const { status, search } = req.query;
        let query = supabase
            .from('captaciones_campo')
            .select('*, usuarios(nombre)')
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (search) query = query.or(`data->>telefono.ilike.%${search}%,data->>direccion.ilike.%${search}%`);

        const { data: captures, error } = await query;
        if (error) throw error;

        res.json(captures);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar captaciones' });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'nueva', 'pendiente_confirmacion', 'disponible', 'descartada'

        const allowed = ['nueva', 'pendiente_confirmacion', 'disponible', 'descartada'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: 'Estado no válido' });
        }

        const { data, error } = await supabase
            .from('captaciones_campo')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: `Estado actualizado a ${status}`, capture: data });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
};
