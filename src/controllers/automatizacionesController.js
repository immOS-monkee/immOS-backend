const supabase = require('../config/supabase');

// =============================================
// TRIGGER TYPES (what event fires the rule)
// =============================================
const TRIGGERS = {
    captacion_nueva: 'Nueva captación registrada',
    propiedad_disponible: 'Propiedad pasa a disponible',
    propiedad_reservada: 'Propiedad reservada',
    visita_sin_confirmar: 'Visita sin confirmar +24h',
    oferta_sin_respuesta: 'Oferta sin respuesta +48h',
    cliente_inactivo: 'Cliente sin actividad +7 días',
    no_show: 'No-show registrado',
    cierre_exitoso: 'Venta/Alquiler cerrado'
};

// =============================================
// ACTION TYPES (what happens when rule fires)
// =============================================
const ACTIONS = {
    crear_tarea: 'Crear tarea para agente',
    enviar_notificacion: 'Enviar notificación interna',
    cambiar_estado: 'Cambiar estado de entidad',
    asignar_etiqueta: 'Asignar etiqueta a cliente',
    log_timeline: 'Registrar en timeline de cliente'
};

// =============================================
// CONDITION EVALUATOR
// Evaluates JSONB conditions: { campo, operador, valor }
// =============================================
function evaluateCondition(condition, data) {
    const { campo, operador, valor } = condition;
    const fieldValue = data?.[campo];
    if (fieldValue === undefined) return true; // Missing field = pass

    switch (operador) {
        case 'eq': return fieldValue == valor;
        case 'neq': return fieldValue != valor;
        case 'gt': return Number(fieldValue) > Number(valor);
        case 'lt': return Number(fieldValue) < Number(valor);
        case 'contains': return String(fieldValue).toLowerCase().includes(String(valor).toLowerCase());
        case 'exists': return fieldValue !== null && fieldValue !== undefined;
        default: return true;
    }
}

function evaluateAllConditions(conditions = [], data = {}, operator = 'AND') {
    if (!conditions.length) return true;
    if (operator === 'OR') return conditions.some(c => evaluateCondition(c, data));
    return conditions.every(c => evaluateCondition(c, data));
}

// =============================================
// ACTION EXECUTOR
// Executes the list of actions for a fired rule
// =============================================
async function executeActions(actions = [], context = {}) {
    const results = [];

    for (const action of actions) {
        try {
            switch (action.tipo) {
                case 'crear_tarea':
                    await supabase.from('tareas_automaticas').insert([{
                        titulo: action.titulo || 'Tarea automática',
                        descripcion: replaceVars(action.descripcion || '', context),
                        asignado_a: action.asignado_a || context.agente_id,
                        entidad_id: context.entidad_id,
                        entidad_tipo: context.trigger,
                        estado: 'pendiente'
                    }]);
                    results.push({ tipo: action.tipo, status: 'ok' });
                    break;

                case 'log_timeline':
                    if (context.cliente_id) {
                        await supabase.from('timeline_cliente').insert([{
                            cliente_id: context.cliente_id,
                            tipo: 'nota',
                            descripcion: replaceVars(action.descripcion || 'Acción automática ejecutada', context),
                            metadata: { automatizacion: true }
                        }]);
                        results.push({ tipo: action.tipo, status: 'ok' });
                    }
                    break;

                case 'enviar_notificacion':
                    // Stored as notification record (frontend polls)
                    await supabase.from('notificaciones').insert([{
                        usuario_id: action.usuario_id || context.agente_id,
                        titulo: replaceVars(action.titulo || 'Aviso automático', context),
                        mensaje: replaceVars(action.mensaje || '', context),
                        tipo: 'automatizacion',
                        leida: false
                    }]).select();
                    results.push({ tipo: action.tipo, status: 'ok' });
                    break;

                case 'cambiar_estado':
                    if (action.tabla && context.entidad_id) {
                        await supabase.from(action.tabla)
                            .update({ estado: action.nuevo_estado })
                            .eq('id', context.entidad_id);
                        results.push({ tipo: action.tipo, status: 'ok' });
                    }
                    break;

                default:
                    results.push({ tipo: action.tipo, status: 'skipped', reason: 'Unknown action' });
            }
        } catch (err) {
            results.push({ tipo: action.tipo, status: 'error', error: err.message });
        }
    }
    return results;
}

function replaceVars(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || `{{${key}}}`);
}

// =============================================
// RULE ENGINE: Fire all active rules for a trigger
// =============================================
exports.fireRules = async (trigger, context = {}) => {
    try {
        const { data: reglas, error } = await supabase
            .from('automatizaciones_reglas')
            .select('*')
            .eq('trigger', trigger)
            .eq('activa', true);

        if (error || !reglas?.length) return;

        for (const regla of reglas) {
            const condiciones = regla.condiciones || [];
            const acciones = regla.acciones || [];
            const operator = regla.condiciones_operador || 'AND';

            if (!evaluateAllConditions(condiciones, context, operator)) continue;

            const results = await executeActions(acciones, { ...context, trigger });

            // Log execution to history
            const allOk = results.every(r => r.status === 'ok' || r.status === 'skipped');
            await supabase.from('historial_automatizaciones').insert([{
                regla_id: regla.id,
                trigger,
                contexto: context,
                resultado: results,
                estado: allOk ? 'exito' : 'error'
            }]);
        }
    } catch (err) {
        console.error('Fire Rules Error:', err);
    }
};

// =============================================
// CRUD FOR RULES (Admin)
// =============================================

// CREATE RULE
exports.createRegla = async (req, res) => {
    try {
        const { nombre, descripcion, trigger, condiciones, condiciones_operador, acciones } = req.body;

        if (!nombre || !trigger || !acciones?.length) {
            return res.status(400).json({ error: 'nombre, trigger y acciones son obligatorios' });
        }
        if (!TRIGGERS[trigger]) {
            return res.status(400).json({ error: `Trigger inválido. Válidos: ${Object.keys(TRIGGERS).join(', ')}` });
        }

        const { data: regla, error } = await supabase
            .from('automatizaciones_reglas')
            .insert([{ nombre, descripcion, trigger, condiciones: condiciones || [], condiciones_operador: condiciones_operador || 'AND', acciones, activa: true }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ message: 'Regla creada', regla });
    } catch (error) {
        console.error('Create Regla Error:', error);
        res.status(500).json({ error: 'Error al crear la regla' });
    }
};

// LIST RULES
exports.getReglas = async (req, res) => {
    try {
        const { data: reglas, error } = await supabase
            .from('automatizaciones_reglas')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(reglas);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar reglas' });
    }
};

// TOGGLE RULE (active/inactive)
exports.toggleRegla = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: current } = await supabase.from('automatizaciones_reglas').select('activa').eq('id', id).single();
        const { data: regla, error } = await supabase
            .from('automatizaciones_reglas')
            .update({ activa: !current.activa })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: `Regla ${regla.activa ? 'activada' : 'pausada'}`, regla });
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar estado de la regla' });
    }
};

// DELETE RULE
exports.deleteRegla = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('automatizaciones_reglas').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Regla eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la regla' });
    }
};

// EXECUTION HISTORY
exports.getHistorial = async (req, res) => {
    try {
        const { data: historial, error } = await supabase
            .from('historial_automatizaciones')
            .select('*, automatizaciones_reglas(nombre, trigger)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(historial);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

// TEST RULE (dry-run — evaluate conditions, list what actions would fire)
exports.testRegla = async (req, res) => {
    try {
        const { id } = req.params;
        const { context = {} } = req.body;

        const { data: regla, error } = await supabase
            .from('automatizaciones_reglas')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !regla) return res.status(404).json({ error: 'Regla no encontrada' });

        const conditionsPassed = evaluateAllConditions(
            regla.condiciones || [],
            context,
            regla.condiciones_operador || 'AND'
        );

        res.json({
            regla: regla.nombre,
            trigger: regla.trigger,
            conditions_passed: conditionsPassed,
            actions_that_would_fire: conditionsPassed ? regla.acciones : [],
            dry_run: true
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al ejecutar test' });
    }
};

// Available triggers and actions catalog
exports.getCatalogo = async (req, res) => {
    res.json({ triggers: TRIGGERS, actions: ACTIONS });
};
