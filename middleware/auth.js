const jwt = require('jsonwebtoken');
require('dotenv').config();

const lindungi = (req, res, next) => {
    try{
        const headerOtentikasi = req.headers.authorization;

        if(!headerOtentikasi) {
            return res.status(401).json({ pesan: " Tidak ada kartu masuk! Silahkan masuk dulu."});
        }

        const token = headerOtentikasi.split(' ')[1];

        const dataUser = jwt.verify(token, process.env.JWT_SECRET);

        req.user = {
            id: dataUser.userId,
            peran: dataUser.role
        };

        next();
    }catch (error) {
        return res.status(401).json({ pesan: "Kartu masuk tidak sah atau sudah kadaluwarsa!"});
    }
};

module.exports = lindungi;