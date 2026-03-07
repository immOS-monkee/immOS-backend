const supabase = require('../config/supabase');

// Helper to ensure agent only sees their own data
const agentFilter = (query, agentId) => query.eq('agente_id', agentId);

// =============================================
// 1. PROPERTIES
// =============================================
exports.getMyProperties = async (req, res) => {
    try {
        const { estado } = req.query;
        let query = supabase
            .from('propiedades')
            .select('*, captaciones(id, agente_id)')
            .eq('agente_id', req.user.id)
            .order('created_at', { ascending: false });

        if (estado) query = query.eq('estado', estado);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar propiedades' });
    }
};

exports.convertCaptation = async (req, res) => {
    try {
        const { captacion_id, propertyData } = req.body;

        // Verify the captation belongs to this agent's zone
        const { data: cap } = await supabase.from('captaciones').select('*').eq('id', captacion_id).single();

        // Create formal property
        const { data: property, error } = await supabase
            .from('propiedades')
            .insert([{
                ...propertyData,
                agente_id: req.user.id,
                captacion_origen_id: captacion_id,
                estado: 'disponible',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        if (error) throw error;

        // Mark captation as converted
        await supabase.from('captaciones').update({ estado: 'convertida', propiedad_id: property.id }).eq('id', captacion_id);

        res.status(201).json(property);
    } catch (error) {
        res.status(500).json({ error: 'Error al convertir captación' });
    }
};

exports.updatePropertyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const { data, error } = await supabase
            .from('propiedades')
            .update({ estado, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('agente_id', req.user.id) // Security: only own properties
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
};

// =============================================
// 2. CLIENTS
// =============================================
exports.getMyClients = async (req, res) => {
    try {
        const { tipo } = req.query;
        let query = supabase
            .from('clientes')
            .select('*')
            .eq('agente_id', req.user.id)
            .order('heat_score', { ascending: false });

        if (tipo) query = query.eq('tipo', tipo);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar clientes' });
    }
};

exports.getClientTimeline = async (req, res) => {
    try {
        const { id } = req.params;

        const [notes, visits, offers] = await Promise.all([
            supabase.from('notas_clientes').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
            supabase.from('visitas').select('*, propiedades(direccion)').eq('cliente_id', id).order('fecha_visita', { ascending: false }),
            supabase.from('ofertas').select('*').eq('cliente_id', id).order('created_at', { ascending: false })
        ]);

        res.json({
            notes: notes.data || [],
            visits: visits.data || [],
            offers: offers.data || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar timeline' });
    }
};

// =============================================
// 3. PIPELINE & OFFERS
// =============================================
exports.getMyOffers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ofertas')
            .select('*, propiedades(direccion, fotos), clientes(nombre, heat_score)')
            .eq('agente_id', req.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar ofertas' });
    }
};

exports.updateOfferStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { etapa } = req.body;

        const { data, error } = await supabase
            .from('ofertas')
            .update({ etapa, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('agente_id', req.user.id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al mover oferta' });
    }
};

exports.closeOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { resultado } = req.body; // 'exitosa' | 'perdida'

        const { data: offer } = await supabase.from('ofertas').select('*').eq('id', id).single();

        const { data, error } = await supabase
            .from('ofertas')
            .update({
                etapa: resultado === 'exitosa' ? 'cerrada_exitosa' : 'perdida',
                fecha_cierre: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;

        // If successful, update the property state
        if (resultado === 'exitosa' && offer.propiedad_id) {
            await supabase.from('propiedades')
                .update({ estado: 'vendida_pendiente_archivo', fecha_venta: new Date().toISOString() })
                .eq('id', offer.propiedad_id);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cerrar oferta' });
    }
};

// =============================================
// 4. RENTALS
// =============================================
exports.getMyRentals = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contratos_alquiler')
            .select('*, propiedades(direccion), clientes(nombre, telefono)')
            .eq('agente_id', req.user.id)
            .eq('estado', 'activo');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar alquileres' });
    }
};

exports.registerRentalPayment = async (req, res) => {
    try {
        const { contrato_id, importe, mes } = req.body;

        const { data, error } = await supabase
            .from('pagos_alquiler')
            .insert([{ contrato_id, importe, mes, fecha_pago: new Date().toISOString() }])
            .select()
            .single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar pago' });
    }
};

exports.createRentalIncident = async (req, res) => {
    try {
        const { contrato_id, descripcion, urgencia } = req.body;

        const { data, error } = await supabase
            .from('incidencias_alquiler')
            .insert([{
                contrato_id,
                descripcion,
                urgencia,
                estado: 'abierta',
                agente_id: req.user.id,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear incidencia' });
    }
};

// =============================================
// 6. CREATE ACTIONS
// =============================================
exports.createClient = async (req, res) => {
    try {
        const { nombre, telefono, email, tipo, preferencias } = req.body;
        const { data, error } = await supabase
            .from('clientes')
            .insert([{ nombre, telefono, email, tipo, preferencias, agente_id: req.user.id, heat_score: 0, created_at: new Date().toISOString() }])
            .select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear cliente' });
    }
};

exports.createProperty = async (req, res) => {
    try {
        const { direccion, precio, metros, habitaciones, banos, operacion, descripcion, tipo } = req.body;
        const { data, error } = await supabase
            .from('propiedades')
            .insert([{ direccion, precio, metros, habitaciones, banos, operacion, descripcion, tipo, agente_id: req.user.id, estado: 'disponible', created_at: new Date().toISOString() }])
            .select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear propiedad' });
    }
};

exports.createOffer = async (req, res) => {
    try {
        const { propiedad_id, cliente_id, importe, condiciones } = req.body;
        const { data, error } = await supabase
            .from('ofertas')
            .insert([{ propiedad_id, cliente_id, importe, condiciones, etapa: 'enviada', agente_id: req.user.id, created_at: new Date().toISOString() }])
            .select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear oferta' });
    }
};

exports.scheduleVisit = async (req, res) => {
    try {
        const { propiedad_id, cliente_id, fecha_visita, notas } = req.body;
        const { data, error } = await supabase
            .from('visitas')
            .insert([{ propiedad_id, cliente_id, fecha_visita, notas, estado: 'pendiente', agente_id: req.user.id, created_at: new Date().toISOString() }])
            .select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al programar visita' });
    }
};

exports.cancelVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        const { data, error } = await supabase
            .from('visitas')
            .update({ estado: 'cancelada', motivo_cancelacion: motivo, updated_at: new Date().toISOString() })
            .eq('id', id).eq('agente_id', req.user.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cancelar visita' });
    }
};

exports.justifyNoShow = async (req, res) => {
    try {
        const { id } = req.params;
        const { justificacion } = req.body;
        const { data, error } = await supabase
            .from('visitas')
            .update({ estado: 'no_show_justificado', justificacion, updated_at: new Date().toISOString() })
            .eq('id', id).eq('agente_id', req.user.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al justificar no-show' });
    }
};

exports.getMyMetrics = async (req, res) => {
    try {
        const agentId = req.user.id;
        const [props, clients, offers, visits, userData] = await Promise.all([
            supabase.from('propiedades').select('id', { count: 'exact', head: true }).eq('agente_id', agentId),
            supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('agente_id', agentId),
            supabase.from('ofertas').select('id, etapa').eq('agente_id', agentId),
            supabase.from('visitas').select('id', { count: 'exact', head: true }).eq('agente_id', agentId),
            supabase.from('usuarios').select('puntos, racha_actual, nivel').eq('id', agentId).single()
        ]);
        const closed = (offers.data || []).filter(o => o.etapa === 'cerrada_exitosa').length;
        res.json({
            propiedades: props.count || 0,
            clientes: clients.count || 0,
            ofertas_cerradas: closed,
            visitas: visits.count || 0,
            puntos: userData.data?.puntos || 0,
            racha: userData.data?.racha_actual || 0,
            nivel: userData.data?.nivel || 'Trainee'
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar métricas' });
    }
};

// =============================================
// 5. DASHBOARD
// =============================================
exports.getDashboardSummary = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const agentId = req.user.id;

        const [todayVisits, hotClients, newCaptations, activeOffers, allMyVisits] = await Promise.all([
            supabase.from('visitas').select('*, propiedades(direccion), clientes(nombre, telefono)').eq('agente_id', agentId).gte('fecha_visita', `${today}T00:00`).lte('fecha_visita', `${today}T23:59`),
            supabase.from('clientes').select('id, nombre, heat_score, telefono').eq('agente_id', agentId).gte('heat_score', 70).order('heat_score', { ascending: false }).limit(5),
            supabase.from('captaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
            supabase.from('ofertas').select('id, propiedad_id, cliente_id, propiedades(direccion), clientes(nombre, telefono)').eq('agente_id', agentId).in('etapa', ['enviada', 'negociacion']),
            supabase.from('visitas').select('*, propiedades(direccion, vendedor_id, clientes:vendedor_id(nombre, telefono)), clientes(nombre, telefono)').eq('agente_id', agentId).in('estado', ['pendiente_confirmacion', 'confirmada'])
        ]);

        // Generate Nudges
        const nudges = [];

        (allMyVisits.data || []).forEach(v => {
            if (v.estado === 'pendiente_confirmacion') {
                // Nudge to notify owner about a new request
                const owner = v.propiedades?.clientes;
                if (owner) {
                    const msg = `Hola ${owner.nombre}, tenemos una nueva solicitud de visita para tu propiedad en ${v.propiedades.direccion}. ¿Te vendría bien el ${new Date(v.fecha_programada).toLocaleString()}?`;
                    nudges.push({
                        id: `notify_owner_${v.id}`,
                        type: 'visit_request',
                        title: `Avisar a propietario: ${owner.nombre}`,
                        subtitle: v.propiedades.direccion,
                        whatsapp_url: `https://wa.me/${owner.telefono?.replace(/\s+/g, '')}?text=${encodeURIComponent(msg)}`,
                        priority: 'high'
                    });
                }
            } else if (v.estado === 'confirmada') {
                // Nudge to confirm with buyer
                const buyer = v.clientes;
                if (buyer) {
                    const msg = `Hola ${buyer.nombre}, te confirmo que la visita a ${v.propiedades.direccion} está programada para el ${new Date(v.fecha_programada).toLocaleString()}. ¡Nos vemos allí!`;
                    nudges.push({
                        id: `notify_buyer_${v.id}`,
                        type: 'visit_confirmed',
                        title: `Confirmar con comprador: ${buyer.nombre}`,
                        subtitle: v.propiedades.direccion,
                        whatsapp_url: `https://wa.me/${buyer.telefono?.replace(/\s+/g, '')}?text=${encodeURIComponent(msg)}`,
                        priority: 'normal'
                    });
                }
            }
        });

        res.json({
            today_visits: todayVisits.data || [],
            hot_clients: hotClients.data || [],
            new_captations: newCaptations.count || 0,
            active_offers: activeOffers.count || 0,
            nudges
        });
    } catch (error) {
        console.error('Closing Dashboard Error:', error);
        res.status(500).json({ error: 'Error al cargar dashboard' });
    }
};
