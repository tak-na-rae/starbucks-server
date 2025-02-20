
const express = require("express");
const cors = require("cors");
const app = express();
const models = require('./models');
require("dotenv").config();
const axios = require("axios");


const port = 8080;
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require('bcryptjs');
const privateKey = crypto.randomBytes(32).toString('hex');

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

app.use(express.json());

app.use(cors({
    origin: ['https://starbucks-vercel.vercel.app', 'starbucks-nu-five.vercel.app','http://localhost:3000'],
    credentials: true
}))

const path = require('path');

const favicon = require('serve-favicon');
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

models.sequelize.sync()
    .then(() => {
        console.log('Sequelize synced!');
    })
    .catch((err) => {
        console.error('Error syncing Sequelize:', err);
    });

// models.sequelize.sync({ alter: true })
//     .then(() => {
//         console.log('Sequelize synced with model changes!');
//     })
//     .catch((err) => {
//         console.error('Error syncing Sequelize:', err);
//     });

// Express 내장 미들웨어 사용
app.use(express.json()); // JSON 형식의 데이터 파싱
app.use(express.urlencoded({ extended: true })); // URL-encoded 데이터 파싱

//회원가입
app.post('/users', async (req, res) => {
    console.log(req.body);
    const { type, user_id, pw, name, address, zonecode, phone, email, birth, sex, store, allTermsChecked } = req.body;

    // 필수 필드 체크
    if (!type || !user_id || !pw || !name || !address || !zonecode || !phone || !email || !allTermsChecked) {
        console.log("Missing fields:", req.body);
        return res.status(400).send('모든 필드를 입력해주세요');
    }

    try {
        // 아이디 중복 확인 (비동기 처리)
        const existUser = await models.User.findOne({ where: { user_id } });
        if (existUser) {
            return res.status(400).send({ success: false, message: "이미 사용중인 아이디입니다." });
        }

        // 비밀번호 해싱 (이미 적혀 있는 대로 처리됨)
        const hashedPassword = await bcrypt.hash(pw, 10);

        // 새 사용자 생성
        const newUser = await models.User.create({
            type,
            user_id: user_id,
            pw: hashedPassword, // 해시된 비밀번호 저장
            name,
            address,
            zonecode,
            phone,
            email,
            birth, 
            sex,
            store,
            allTermsChecked
        });

        // 성공 응답
        res.send({ success: true, user: newUser });
    } catch (err) {
        console.error(err);
        res.status(400).send("회원가입 실패");
    }
});

//로그인
app.post('/users/login', (req, res) => {
    const { user_id, pw } = req.body;

    models.User.findOne({ where: { user_id } })
        .then(async (result) => {
            if (result) {
                const match = await bcrypt.compare(pw, result.pw);
                if(match){
                    const user = { id: result.user_id, username: result.user_id };
                    const accessToken = jwt.sign(user, privateKey, { expiresIn: '1h' });

                    res.send({
                        user: result.user_id,
                        accessToken: accessToken
    
                    });
                }else {
                    res.status(401).send({ message: '비밀번호가 일치하지 않습니다.' });
                }
            } else {
                res.status(401).send({ message: '사용자를 찾을 수 없습니다.' });
            }
        })
        .catch((err) => {
            console.error(err);
            res.status(500).send('서버 오류');
        })
});

app.post('/auth', (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
        return res.send(false);
    }

    try {
        const decoded = jwt.verify(accessToken, privateKey);
        res.send({ result: decoded });
    } catch (err) {
        res.send({ result: "검증 실패", error: err });
    }
});


app.get('/users/check-id', (req, res) => {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).send({ success: false, message: '아아디를 입력해주세요.' })
    }
    //데이터베이스에서 아이디 검색
    models.User.findOne({
        where: { user_id },
    }).then((user) => {
        if (user) {
            res.send({ success: false, message: '이미 사용중인 아이디입니다.' })
        } else {
            res.send({ success: true, message: '사용 가능한 아아디입니다.' })
        }
    }).catch((err) => {
        console.error(err);
        // res.send({ success: false, message: '서버 오류가 발생했습니다.' })
        if (err.name === 'SequelizeConnectionError') {
            return res.status(503).send({ success: false, message: '데이터베이스 연결 오류가 발생했습니다.' });
        } else {
            return res.status(500).send({ success: false, message: '서버 오류가 발생했습니다.' });
        }
    })
})

//아이디 찾기
app.get('/users/find-id', (req, res) => {
    const {user_id} = req.query;

})

//지도 설정
app.get("/api/nearby-stores", async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: "위치 정보가 필요합니다." });
    }

    try {
        const apiUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=2000&type=cafe&keyword=스타벅스&key=${GOOGLE_MAPS_API_KEY}`;

        console.log(`Google API 요청: ${apiUrl}`); // 요청 URL 로깅

        const response = await axios.get(apiUrl);
        const results = response.data.results;

        console.log("Google API 응답:", results); // 응답 데이터 로깅

        if (!results || results.length === 0) {
            return res.status(404).json({ error: "근처에 스타벅스 매장이 없습니다." });
        }

        res.json(results); // 매장 정보 응답
    } catch (error) {
        console.error("Google Maps API 요청 오류:", error.response?.data || error.message);
        res.status(500).json({ error: "매장 정보를 가져오는 데 실패했습니다." });
    }
});


app.listen(port, () => {
    console.log('서버가 돌아가고 있습니다.')
    models.sequelize.sync()
        .then(() => {
            console.log('DB연결 성공')
        })
        .catch((err) => {
            console.error(err);
            console.log('DB연결 에러')
            process.exit();
        })
})