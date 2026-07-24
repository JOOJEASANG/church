import fs from 'node:fs';

const filePath = 'database.rules.json';
const rulesFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const rules = rulesFile.rules;

rules.admins['.read'] = "auth != null && root.child('admins').child(auth.uid).exists()";
rules.admins.$uid['.read'] = "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())";

rules.applications['.read'] = "auth != null && (root.child('admins').child(auth.uid).exists() || (query.orderByChild === 'userUid' && query.equalTo === auth.uid))";
rules.applications.$id['.write'] = "auth != null && (root.child('admins').child(auth.uid).exists() || (root.child('users').child(auth.uid).child('status').val() === 'approved' && ((!data.exists() && newData.exists() && newData.child('userUid').val() === auth.uid && newData.child('kind').val() !== '재능나눔' && newData.child('kind').val() !== '모임' && newData.child('kind').val() !== '행사') || (data.exists() && !newData.exists() && data.child('userUid').val() === auth.uid))))";

fs.writeFileSync(filePath, `${JSON.stringify(rulesFile, null, 2)}\n`);
console.log('database.rules.json 추가 하드닝 완료');
