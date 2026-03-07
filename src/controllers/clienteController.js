const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');

// === LISTA CON FILTROS ===
exports.getClientes = async (req, res) => {
    try {
        const { q, rol, min_heat, max_heat } = req.query;

        let query = supabase
            .from('clientes')
            .select('*, incidencias_riesgo(id, tipo, estado)')
            .order('heat_score', { ascending: false });

        if (q) {
            query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`);
        }
        if (rol) query = query.eq('rol', rol);
        if (min_heat) query = query.gte('heat_score', parseInt(min_heat));
        if (max_heat) query = query.lte('heat_score', parseInt(max_heat));

        const { data: clientes, error } = await query;
        if (error) throw error;

        res.json(clientes);
    } catch (error) {
        console.error('Get Clientes Error:', error);
        res.status(500).json({ error: 'Error al listar clientes' });
    }
};

// === CREAR / ALTA (con detección de duplicados) ===
exports.createCliente = async (req, res) => {
    try {
        const { nombre, telefono, email, origen, rol } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'nombre y telefono son obligatorios' });
        }

        // -- Duplicate Detection (by phone or email) --
        if (telefono || email) {
            let dupeQuery = supabase.from('clientes').select('id, nombre, telefono, email');
            if (telefono) dupeQuery = dupeQuery.eq('telefono', telefono);

            const { data: existing } = await dupeQuery.limit(1).single();
            if (existing) {
                return res.status(409).json({
                    error: 'Cliente duplicado',
                    duplicate: existing,
                    code: 'DUPLICATE_DETECTED'
                });
            }
        }

        const { data: cliente, error } = await supabase
            .from('clientes')
            .insert([{
                nombre,
                telefono: telefono || null,
                email: email || null,
                origen: origen || 'manual',
                rol: rol || 'propietario',
                heat_score: 0,
                nivel_riesgo: 'bajo'
            }])
            .select()
            .single();

        if (error) throw error;

        // Auto-log to timeline
        await supabase.from('timeline_cliente').insert([{
            cliente_id: cliente.id,
            tipo: 'alta',
            descripcion: `Cliente creado desde ${origen || 'manual'}`,
            metadata: { por: req.user?.id }
        }]);

        // Module 10: Automatizaciones
        await fireRules('cliente_nuevo', {
            agente_id: req.user.id,
            cliente_id: cliente.id,
            nombre: cliente.nombre,
            email: cliente.email
        });

        res.status(201).json({ message: 'Cliente creado', cliente });
    } catch (error) {
        console.error('Create Cliente Error:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
};

// === DETALLE ===
exports.getCliente = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

        res.json(cliente);
    } catch (error) {
        console.error('Get Cliente Error:', error);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
};

// === ACTUALIZAR ===
exports.updateCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        delete updates.id;
        delete updates.heat_score; // Only recalculated internally
        updates.updated_at = new Date().toISOString();

        const { data: cliente, error } = await supabase
            .from('clientes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Cliente actualizado', cliente });
    } catch (error) {
        console.error('Update Cliente Error:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
};

// === TIMELINE ===
exports.getTimeline = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: events, error } = await supabase
            .from('timeline_cliente')
            .select('*, usuarios(nombre)')
            .eq('cliente_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(events);
    } catch (error) {
        console.error('Get Timeline Error:', error);
        res.status(500).json({ error: 'Error al obtener timeline' });
    }
};

// === ADD TIMELINE EVENT + RECALCULATE HEAT SCORE ===
exports.addTimelineEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, descripcion, metadata = {} } = req.body;

        const validTypes = ['llamada', 'nota', 'visita', 'oferta', 'email', 'whatsapp', 'reunion'];
        if (!tipo || !validTypes.includes(tipo)) {
            return res.status(400).json({ error: `Tipo inválido. Tipos válidos: ${validTypes.join(', ')}` });
        }

        const { data: event, error: eventErr } = await supabase
            .from('timeline_cliente')
            .insert([{
                cliente_id: id,
                tipo,
                descripcion: descripcion || '',
                metadata,
                usuario_id: req.user?.id
            }])
            .select()
            .single();

        if (eventErr) throw eventErr;

        // Recalculate heat score based on this activity type
        const HEAT_DELTA = {
            visita: 20,
            oferta: 10,
            reunion: 15,
            llamada: 5,
            whatsapp: 5,
            email: 3,
            nota: 0
        };

        const delta = HEAT_DELTA[tipo] || 0;
        if (delta > 0) {
            const { data: cliente } = await supabase.from('clientes').select('heat_score').eq('id', id).single();
            const newScore = Math.min(100, (cliente?.heat_score || 0) + delta);

            await supabase.from('clientes')
                .update({ heat_score: newScore, updated_at: new Date().toISOString() })
                .eq('id', id);
        }

        res.status(201).json({ message: 'Evento registrado', event });
    } catch (error) {
        console.error('Add Timeline Event Error:', error);
        res.status(500).json({ error: 'Error al registrar evento' });
    }
};

// === REGISTRAR INCIDENCIA DE RIESGO ===
exports.addIncidencia = async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, descripcion } = req.body;

        const riskTypes = ['impago', 'no_show_repetido', 'conflicto', 'fraude', 'otro'];
        if (!riskTypes.includes(tipo)) {
            return res.status(400).json({ error: `Tipo inválido. Tipos: ${riskTypes.join(', ')}` });
        }

        const { data: incidencia, error } = await supabase
            .from('incidencias_riesgo')
            .insert([{ cliente_id: id, tipo, descripcion, estado: 'abierta' }])
            .select()
            .single();

        if (error) throw error;

        // Update risk level based on open incidences count
        const { count } = await supabase
            .from('incidencias_riesgo')
            .select('*', { count: 'exact' })
            .eq('cliente_id', id)
            .eq('estado', 'abierta');

        const nivel_riesgo = count >= 3 ? 'alto' : count >= 1 ? 'medio' : 'bajo';
        await supabase.from('clientes').update({ nivel_riesgo }).eq('id', id);

        res.status(201).json({ message: 'Incidencia registrada', incidencia, nivel_riesgo });
    } catch (error) {
        console.error('Add Incidencia Error:', error);
        res.status(500).json({ error: 'Error al registrar incidencia' });
    }
};
