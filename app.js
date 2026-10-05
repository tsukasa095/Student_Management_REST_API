require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const pool = require('./db');
const lindungi = require('./middleware/auth');
const {connectRedis, redisClient } = require('./config/redis');

const app = express();

connectRedis();

app.use(express.json());

const invalidateStudentCache = async () => {
    if (redisClient.isReady){
        await redisClient.del('students:all');
        console.log('Cache dihapus');
    }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));

app.get('/students/:id', async (req, res) => {
    try{
        const id = Number(req.params.id);

        if(isNaN(id) || id <= 0){
            return res.status(400).json({ pesan: "ID Tidak Valid"});
        }
        const sql = "SELECT * FROM students WHERE id = $1";
        const hasil = await pool.query(sql, [id]);

        if(hasil.rows.length === 0){
            return res.status(404).json({ pesan: "Mahasiswa Tidak Ditemukan"});
        }
        
        res.status(200).json({ data: hasil.rows[0] });

    }catch (error){
        console.log(error);
        res.status(500).json({ pesan: "Terjadi Kesalahan Server" });
    }
});

app.put('/students/:id', lindungi, async(req, res) => {
    try{
        const id = Number(req.params.id);
        const { name, email, major, semester } = req.body;

        if(isNaN(id) || id <= 0) {
            return res.status(400).json({ pesan: "ID Tidak Valid" });
        }

        if(!name || !email || !major || !semester){
            return res.status(400).json({ pesan: "Semua Bidang Wajib Diisi" });
        }

        const semesterAngka = Number(semester);
        if (isNaN(semesterAngka) || semesterAngka <= 0 || semesterAngka > 14) {
            return res.status(400).json({ pesan:"Semester Harus Angka Antara 1-14"});
        }

        const sql = `UPDATE students SET name = $1, email = $2, major = $3, semester = $4 
                    WHERE id = $5 RETURNING *`;

        const hasil = await pool.query(sql, [name, email, major, semesterAngka, id]);

        if (hasil.rows.length === 0){
            return res.status(404).json({ pesan:"Mahasiswa Tidak Ditemukan"});
        }

        await invalidateStudentCache();
        res.status(200).json({ pesan:"Data Diperbarui", data: hasil.rows[0] });
    }catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ pesan:"Email Sudah Terdaftar"});
        }
        console.log(error);
        res.status(500).json({ pesan:"Terjadi Kesalahan Server"});
    }
});

app.delete('/students/:id', lindungi, async (req, res) => {
    try{
        const id = Number(req.params.id);

        if (isNaN(id) || id <= 0){
            return res.status(400).json({ pesan:"ID Tidak Valid"});
        }

        const sql = "DELETE FROM students WHERE id =  $1 RETURNING *";
        const hasil = await pool.query(sql, [id]);

        if (hasil.rows.length === 0){
            return res.status(404).json({ pesan:"Mahasiswa Tidak Ditemukan"});
        }

        await invalidateStudentCache();
        res.status(200).json({ pesan:"Mahasiswa Berhasil Dihapus"});
    }catch(error) {
        console.log(error);
        res.status(500).json({ pesan:"Terjadi Kesalahan Server"})
    }
})

    app.get("/students", lindungi, async (req, res) => {
    try {
        const cacheKey = 'students:all';

        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                console.log('Cache HIT');
                return res.json(JSON.parse(cached));
            }
            console.log('Cache MISS');
        }

        const kataKunci = req.query.search || "";
        const nilaiCari = `%${kataKunci}%`;

        let hasil;
        if (kataKunci) {
        const sql = "SELECT * FROM students WHERE name ILIKE $1 ORDER BY id";
        hasil = await pool.query(sql, [nilaiCari]);
        } else {
        const sql = "SELECT * FROM students ORDER BY id";
        hasil = await pool.query(sql);
        }
        if (redisClient.isReady && !kataKunci) {
            await redisClient.set(cacheKey, JSON.stringify({ data: hasil.rows}), { EX: 60});
            console.log('Data disimpan ke Redis, TTL 60 detik');
        }

        res.status(200).json({ data: hasil.rows });
    } catch (error) {
        console.log(error);
        res.status(500).json({ pesan: "Terjadi Kesalahan Server" });
    }
    });

    app.post("/students", lindungi, async (req, res) => {
        try {
            const { name, email, major, semester } = req.body;

            if (!name || !email || !major || !semester) {
            return res.status(400).json({ pesan: "Semua Bidang Wajib Diisi" });
            }

            const semesterAngka = Number(semester);
            if (isNaN(semesterAngka) || semesterAngka <= 0 || semesterAngka > 14) {
            return res
                .status(400)
                .json({ pesan: "Semester harus angka antara 1-14" });
            }
            const sql = `INSERT INTO students (name, email, major, semester)
                        VALUES ($1, $2, $3, $4) RETURNING *`;
            const hasil = await pool.query(sql, [
            name,
            email,
            major,
            semesterAngka,
            ]);

            await invalidateStudentCache();
            res.status(201).json({ pesan: "Mahasiswa Ditambahkan", data: hasil.rows[0] });
        } catch (error) {
            if (error.code === "23505") {
            return res.status(400).json({ pesan: "Email Sudah Terdaftar" });
            }
            console.log(error);
            res.status(500).json({ pesan: "Terjadi Kesalahan Server" });
        }
        });
        
    app.post('/register', async (req, res) => {
        try{
            const {name, email, password } = req.body;

            if(!name || !email || !password) {
                return res.status(400).json({ pesan: "Nama, email, dan kata sandi wajib diisi"});
            }

            const jumlahPutaran = 10;
            const password_hash = await bcrypt.hash(password, jumlahPutaran);

            const sql = `INSERT INTO users (name, email, password_hash)
                        VALUES ($1, $2, $3) RETURNING id, name, email, role, create_at`;

            const hasil = await pool.query(sql, [name, email, password_hash]);

            res.status(201).json({
                pesan: "Pendaftaran Berhasil!",
                data: hasil.rows[0]
            });
        }catch (error){
            if (error.code === '23505'){
                return res.status(400).json({ pesan: "Email sudah terdaftar!" });
            }
            
            console.log( error );
            res.status(500).json({ pesan: "Terjadi kesalahan server"});
        }
    });

    app.post('/login', async (req, res) => {
        try{
            const {email, password} = req.body;

            if (!email || !password){
                return res.status(400).json({ pesan: "Email dan kata sandi wajib diisi" });
            }

            const sql = "SELECT * FROM users WHERE email = $1";
            const hasil = await pool.query(sql, [email]);

            if (hasil.rows.lenght === 0) {
                return res.status(401).json({ pesan: "Email atau kata sandi salah" });
            }
            
            const user = hasil.rows[0];

            const cocok = await bcrypt.compare(password, user.password_hash);

            if(!cocok){
                return res.status(401).json({ pesan: "Email atau kata sandi salah" });
            }

            const token = jwt.sign(
                { userId: user.id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );

            res.status(200).json({
                pesan: "Berhasil Masuk!",
                token: token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        }catch (error){
            console.log(error),
            res.status(500).json({ pesan: "Terjadi kesalahan server" });
        }
    });



app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});