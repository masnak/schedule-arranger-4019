'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, (req, res, next) => {
  const scheduleId = uuid.v4();
  const updatedAt = new Date();
  Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255),
    memo: req.body.memo,
    createdBy: req.user.id,
    updatedAt: updatedAt
  }).then((schedule) => {
    const candidateNames = req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
    const candidates = candidateNames.map((c) => {
      return {
        candidateName: c,
        scheduleId: schedule.scheduleId
      };
    });
    Candidate.bulkCreate(candidates).then(() => {
      res.redirect('/schedules/' + schedule.scheduleId);
    });
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['"updatedAt"', 'DESC']]
  }).then((schedule) => {
    if (schedule) {
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['"candidateId"', 'ASC']]
      }).then((candidates) => {
        // -*- 写経開始

        // 疑問点：

        // 大文字のAvailabilityは、このファイルの上部でconstされている。
        // 中身は/models/availabilityなので、DBとの窓口？データモデル？何と呼ぶのが正しいのだろう？
        // なぜ大文字始まりなのだろう？JSの文法用語だと何だろう？コンストラクション関数？
        // そうであれば、どこでnewしているのだろう？暗黙的にnewを行うのか？それとも？？？
        //　-*-

        //データベースからその予定のすべての出欠を取得する（オリジナルコメント）
        Availability.findAll({
          include: [
            {
              model: User,
              attributes: ['userId', 'username']
            }
          ],
          where: { scheduleId: schedule.scheduleId},
          order: [[User, 'username', 'ASC'], ['"candidateId"', 'ASC']]

          // -*- mn
          // DBからデータを取り出している処理だろうけれど、この書き方はどこを見れば調べられるのだろう？
          // -*-

        }).then((availabilities) => {


          // -*- mn
          // このavailabilitiesって何？下を見るとforEachとかやってるから配列だよね。
          // 配列の宣言なんてしてないのに。
          //　.thenというのはPromiseという技をかけているのだよね。何がどうなっている？
          // -*-


          //出欠MapMap（キー：ユーザーID, 値：出欠Map（キー：候補ID, 値：出欠))を作成する（オリジナル）
          const availabilityMapMap = new Map(); //key: userId, value: Map(key: candidateId, availability)（オリジナル）
          availabilities.forEach((a) => {
            const map = availabilityMapMap.get(a.user.userId) || new Map();

            // -*- mn この上の行は何をやっているのだろう？

            map.set(a.candidateId, a.availability);
            availabilityMapMap.set(a.user.userId, map);
          });

          //閲覧ユーザーと出欠に紐付くユーザーからユーザーMap（キー：ユーザーID、値：ユーザー）を作る（オリジナル）
          const userMap = new Map(); // key: userId, value: User
          userMap.set(parseInt(req.user.id), {
            isSelf: true,
            userId: parseInt(req.user.id),
            username: req.user.username
          });
          availabilities.forEach((a) => {
            userMap.set(a.user.userId, {
              isSelf: parseInt(req.user.id) === a.user.userId, //閲覧ユーザー自身であるかを含める
              userId: a.user.userId,
              username: a.user.username
            });
          });

          // 全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
          const users = Array.from(userMap).map((keyValue) => keyValue[1]);
          users.forEach((u) => {
            candidates.forEach((c) => {
              const map = availabilityMapMap.get(u.userId) || new Map();
              const a = map.get(c.candidateId) || 0; //デフォルト値は0を利用
              map.set(c.candidateId, a);
              availabilityMapMap.set(u.userId, map);
            });
          });

        res.render('schedule', {
          user: req.user,
          schedule: schedule,
          candidates: candidates,
          users: users,
          availabilityMapMap: availabilityMapMap
        });
        });

        // -*- 写経ここまで

      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  });
});

module.exports = router;