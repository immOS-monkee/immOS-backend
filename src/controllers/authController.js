const supabase = require('../config/supabase');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwtHelper');
const bcrypt = require('bcrypt'); // Added dependency

exports.register = async (req, res) => {
    try {
        const { email, password, nombre, rol } = req.body;

        // 1. Basic Validation
        if (!email || !password || !nombre || !rol) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 2. Hash Password (In a real app, use scrypt/argon2 or Supabase Auth)
        const passwordHash = await bcrypt.hash(password, 10);

        // 3. Insert into DB (Table 'usuarios' defined in schema.sql)
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ email, password_hash: passwordHash, nombre, rol }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'User created successfully', user: { id: data.id, email: data.email, rol: data.rol } });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[AUTH] Intento de login para: ${email}`);

        // --- BYPASS DE DESARROLLO (MODO ROBUSTO) ---
        const DEV_ADMIN_EMAIL = 'admin@inmoos.com';
        const DEV_ADMIN_PASS = 'admin_password_123';

        if (email?.trim().toLowerCase() === DEV_ADMIN_EMAIL && password === DEV_ADMIN_PASS) {
            console.log('[AUTH] Bypass de desarrollo activado');
            const userMock = {
                id: '00000000-0000-0000-0000-000000000000', // Valid UUID for Dev Admin
                nombre: 'Super Admin (Modo Dev)',
                rol: 'super_admin'
            };
            const accessToken = generateAccessToken(userMock);
            const refreshToken = generateRefreshToken(userMock);

            res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
            return res.json({ accessToken, user: userMock });
        }
        // -----------------------------------------------------------------------

        // 1. Get User
        const { data: dbUser, error: dbError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (dbError || !dbUser) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2. Verify Password
        const isValid = await bcrypt.compare(password, dbUser.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3. Generate Tokens
        const accessToken = generateAccessToken(dbUser);
        const refreshToken = generateRefreshToken(dbUser);

        // 4. Set Refresh Token in HttpOnly Cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            accessToken,
            user: { id: dbUser.id, nombre: dbUser.nombre, rol: dbUser.rol }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

        const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (!decoded) return res.status(401).json({ error: 'Invalid refresh token' });

        // Fetch user to ensure they still exist and are active
        const { data: user, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol, email, activo')
            .eq('id', decoded.id)
            .single();

        if (error || !user || !user.activo) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        // Generate NEW tokens (rotation)
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Update cookie
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ accessToken: newAccessToken, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
