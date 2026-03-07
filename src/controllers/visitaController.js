const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');
const { crearInterno } = require('./notificacionController');

const VALID_STATES = ['pendiente_confirmacion', 'aceptada_por_propietario', 'confirmada', 'reprogramada', 'cancelada', 'en_curso', 'completada', 'no_show', 'no_show_justificado'];

// === LIST ===
exports.getVisitas = async (req, res) => {
    try {
        const { estado, propiedad_id, agente_id: filterAgent, fecha_desde } = req.query;

        let query = supabase
            .from('visitas')
            .select(`
                *,
                propiedades(id, direccion, tipo_propiedad, vendedor_id),
                usuarios(id, nombre)
            `)
            .order('fecha_programada', { ascending: true });

        // Role-based filtering
        if (req.user.rol === 'agente_captacion' || req.user.rol === 'agente_cierre') {
            query = query.eq('agente_id', req.user.id);
        } else if (req.user.rol === 'propietario') {
            // Owners see visits for their own properties
            // First, find the cliente record for this user
            const { data: cliente } = await supabase
                .from('clientes')
                .select('id')
                .eq('email', req.user.email)
                .single();

            if (cliente) {
                // Filter visits where the property belongs to this client
                // Note: PostgREST doesn't support deep joins for filtering easily without views, 
                // so we fetch owner's property IDs first.
                const { data: props } = await supabase.from('propiedades').select('id').eq('vendedor_id', cliente.id);
                const propIds = (props || []).map(p => p.id);
                query = query.in('propiedad_id', propIds);
            } else {
                return res.json([]); // No client record, no properties, no visits
            }
        }

        if (filterAgent) query = query.eq('agente_id', filterAgent);
        if (estado) query = query.eq('estado', estado);
        if (propiedad_id) query = query.eq('propiedad_id', propiedad_id);
        if (fecha_desde) query = query.gte('fecha_programada', fecha_desde);

        const { data: visitas, error } = await query;
        if (error) throw error;

        res.json(visitas);
    } catch (error) {
        console.error('Get Visitas Error:', error);
        res.status(500).json({ error: 'Error al listar visitas' });
    }
};

// === CREATE ===
exports.createVisita = async (req, res) => {
    try {
        const { propiedad_id, comprador_id, fecha_programada, notas, geocerca_activada } = req.body;
        let agente_id = req.user.id;

        if (!propiedad_id || !fecha_programada) {
            return res.status(400).json({ error: 'propiedad_id y fecha_programada son obligatorios' });
        }

        // If the requester is a buyer or owner, we must find the agent assigned to the property
        if (req.user.rol === 'comprador' || req.user.rol === 'propietario') {
            const { data: prop, error: propError } = await supabase
                .from('propiedades')
                .select('agente_id')
                .eq('id', propiedad_id)
                .single();

            if (propError || !prop?.agente_id) {
                return res.status(400).json({ error: 'La propiedad no tiene un agente asignado.' });
            }
            agente_id = prop.agente_id;
        }

        // --- Conflict Check: no overlap for same agent within 1.5h ---
        const checkFrom = new Date(fecha_programada);
        const checkTo = new Date(checkFrom.getTime() + 90 * 60 * 1000); // +90 min

        const { data: overlap } = await supabase
            .from('visitas')
            .select('id, fecha_programada')
            .eq('agente_id', agente_id)
            .not('estado', 'in', '("cancelada","no_show")')
            .gte('fecha_programada', checkFrom.toISOString())
            .lte('fecha_programada', checkTo.toISOString());

        if (overlap && overlap.length > 0) {
            return res.status(409).json({
                error: 'Solapamiento de agenda detectado',
                conflict: overlap[0]
            });
        }

        const { data: visita, error } = await supabase
            .from('visitas')
            .insert([{
                agente_id,
                propiedad_id,
                comprador_id: comprador_id || (req.user.rol === 'comprador' ? req.user.id : null),
                fecha_programada,
                estado: 'pendiente_confirmacion',
                notas: notas || '',
                geocerca_activada: geocerca_activada || false
            }])
            .select()
            .single();

        if (error) throw error;

        // Notify Agent
        await crearInterno(
            agente_id,
            'Nueva Solicitud de Visita',
            `Un cliente ha solicitado una visita para la propiedad en ${propiedad_id}.`, // Idealy we'd have the address here
            'automatizacion',
            { visita_id: visita.id, propiedad_id }
        );

        res.status(201).json({ message: 'Visita programada', visita });
    } catch (error) {
        console.error('Create Visit Error:', error);
        res.status(500).json({ error: 'Error al crear la visita' });
    }
};

// === GET DETAIL ===
exports.getVisita = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: visita, error } = await supabase
            .from('visitas')
            .select('*, propiedades(id, direccion, coordenadas), usuarios(id, nombre)')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!visita) return res.status(404).json({ error: 'Visita no encontrada' });

        res.json(visita);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la visita' });
    }
};

// === CONFIRM (Owner accepts availability) ===
exports.confirmarVisita = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: visita, error } = await supabase
            .from('visitas')
            .update({ estado: 'aceptada_por_propietario' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Notify Agent (Owner just accepts availability, Agent must validate)
        await crearInterno(
            visita.agente_id,
            'Disponibilidad Confirmada por Propietario 🏠',
            `El propietario ha dado el visto bueno para la visita. Valida los datos y confirma al comprador.`,
            'info',
            { visita_id: id }
        );

        res.json({ message: 'Disponibilidad registrada. Pendiente de validación por el agente.', visita });
    } catch (error) {
        console.error('Confirmar Visita Error:', error);
        res.status(500).json({ error: 'Error al registrar disponibilidad' });
    }
};

// === VALIDATE (Agent confirms to Buyer) ===
exports.validarVisita = async (req, res) => {
    try {
        const { id } = req.params;

        // Security: only agent assigned to visit can validate
        const { data: visita, error } = await supabase
            .from('visitas')
            .update({ estado: 'confirmada' })
            .eq('id', id)
            .eq('agente_id', req.user.id) // Only the assigned agent
            .select()
            .single();

        if (error) throw error;
        if (!visita) return res.status(403).json({ error: 'No autorizado o visita no encontrada' });

        // Notify Buyer (Finally!)
        if (visita.comprador_id) {
            await crearInterno(
                visita.comprador_id,
                'Visita Confirmada 🏠',
                'Tu Agente ha confirmado la visita. ¡Nos vemos pronto!',
                'success',
                { visita_id: id }
            );

            // Auto-log to client timeline
            await supabase.from('timeline_cliente').insert([{
                cliente_id: visita.comprador_id,
                tipo: 'visita',
                descripcion: `Visita validada y confirmada por Agente`,
                metadata: { visita_id: id }
            }]);
        }

        res.json({ message: 'Visita confirmada y notificada al comprador', visita });
    } catch (error) {
        res.status(500).json({ error: 'Error al validar visita' });
    }
};

// === CHECK-IN (Geocerca) ===
exports.checkIn = async (req, res) => {
    try {
        const { id } = req.params;
        const { lat, lng } = req.body;

        const now = new Date().toISOString();
        const { data: visita, error } = await supabase
            .from('visitas')
            .update({
                estado: 'en_curso',
                fecha_inicio: now
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Check-in registrado ✅', visita, coords: { lat, lng } });
    } catch (error) {
        res.status(500).json({ error: 'Error en check-in' });
    }
};

// === CHECK-OUT + FEEDBACK ===
exports.checkOut = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback_emoji, checklist, notas_post, interes_nivel } = req.body;

        if (!feedback_emoji) {
            return res.status(400).json({ error: 'feedback_emoji es obligatorio para cerrar la visita' });
        }

        const now = new Date().toISOString();
        const resultado_feedback = { emoji: feedback_emoji, checklist: checklist || [], notas: notas_post, interes: interes_nivel };

        const { data: visita, error } = await supabase
            .from('visitas')
            .update({
                estado: 'completada',
                fecha_fin: now,
                resultado_feedback
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Heat Score: boost buyer +20 for completing a visit
        if (visita.comprador_id) {
            const { data: buyer } = await supabase.from('clientes').select('heat_score').eq('id', visita.comprador_id).single();
            const newScore = Math.min(100, (buyer?.heat_score || 0) + 20);
            await supabase.from('clientes').update({ heat_score: newScore }).eq('id', visita.comprador_id);

            await supabase.from('timeline_cliente').insert([{
                cliente_id: visita.comprador_id,
                tipo: 'visita',
                descripcion: `Visita completada 🏠 · Feedback: ${feedback_emoji}`,
                metadata: resultado_feedback
            }]);
        }

        res.json({ message: 'Visita completada con feedback ✅', visita });
    } catch (error) {
        res.status(500).json({ error: 'Error en check-out' });
    }
};

// === MARK NO-SHOW ===
exports.markNoShow = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: visita, error } = await supabase
            .from('visitas')
            .update({ estado: 'no_show' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Notify Buyer of No-Show
        if (visita.comprador_id) {
            await crearInterno(
                visita.comprador_id,
                'Aviso de Inasistencia (No-Show)',
                'Se ha registrado tu inasistencia a la visita. Tu Heat Score ha sido penalizado.',
                'warning',
                { visita_id: id }
            );

            // Penalize buyer heat score -15
            const { data: buyer } = await supabase.from('clientes').select('heat_score').eq('id', visita.comprador_id).single();
            const newScore = Math.max(0, (buyer?.heat_score || 0) - 15);
            await supabase.from('clientes').update({ heat_score: newScore }).eq('id', visita.comprador_id);

            await supabase.from('timeline_cliente').insert([{
                cliente_id: visita.comprador_id,
                tipo: 'nota',
                descripcion: `No-show registrado ⛔ (-15 pts Heat Score)`,
                metadata: { visita_id: id }
            }]);
        }

        // Module 10: Automatización
        await fireRules('no_show', {
            agente_id: visita.agente_id,
            cliente_id: visita.comprador_id,
            entidad_id: id,
            visita_id: id
        });

        res.json({ message: 'No-show registrado. Heat Score penalizado -15.', visita });
    } catch (error) {
        res.status(500).json({ error: 'Error al marcar no-show' });
    }
};

// === JUSTIFY NO-SHOW (reverses penalty) ===
exports.justifyNoShow = async (req, res) => {
    try {
        const { id } = req.params;
        const { justificacion } = req.body;

        if (!justificacion) return res.status(400).json({ error: 'Justificación obligatoria' });

        const { data: visita, error } = await supabase
            .from('visitas')
            .update({ estado: 'no_show_justificado', justificacion_no_show: justificacion, no_show_justificado: true })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Reverse the -15 penalty
        if (visita.comprador_id) {
            const { data: buyer } = await supabase.from('clientes').select('heat_score').eq('id', visita.comprador_id).single();
            const newScore = Math.min(100, (buyer?.heat_score || 0) + 15);
            await supabase.from('clientes').update({ heat_score: newScore }).eq('id', visita.comprador_id);
        }

        res.json({ message: 'No-show justificado. Penalización revertida.', visita });
    } catch (error) {
        res.status(500).json({ error: 'Error al justificar no-show' });
    }
};
