# 퀴즈를 풀어라 GitHub Pages 배포 설명서

`퀴즈를 풀어라`는 HTML, CSS, JavaScript만 사용하는 정적 웹사이트입니다. 서버나 데이터베이스 없이 GitHub Pages에 올려서 사용할 수 있습니다.

## 폴더 구성

GitHub에 올릴 파일은 이 폴더 전체입니다.

- `index.html`: 참가자용 QR 미션 화면
- `admin.html`: 관리자 화면
- `styles.css`: 참가자 화면 디자인
- `admin.css`: 관리자 화면 디자인
- `app.js`: 참가자 화면 기능
- `admin.js`: 관리자 기능
- `questions.json`: 문제, 힌트, 설문 문항 데이터
- `assets/`: 로고와 힌트 이미지

## 1. GitHub 저장소 만들기

1. GitHub에 로그인합니다.
2. 오른쪽 위 `+` 버튼을 누릅니다.
3. `New repository`를 선택합니다.
4. 저장소 이름을 입력합니다. 예: `quiz-mission`
5. `Public`을 선택합니다.
6. `Create repository`를 누릅니다.

## 2. 파일 업로드

초보자용 웹 업로드 방법입니다.

1. 만든 저장소 화면에서 `Add file`을 누릅니다.
2. `Upload files`를 선택합니다.
3. 이 프로젝트 폴더 안의 파일과 `assets` 폴더를 모두 끌어다 놓습니다.
4. 아래쪽 `Commit changes` 버튼을 누릅니다.

## 3. GitHub Pages 켜기

1. 저장소 상단의 `Settings`를 누릅니다.
2. 왼쪽 메뉴에서 `Pages`를 누릅니다.
3. `Build and deployment` 영역에서 `Source`를 `Deploy from a branch`로 선택합니다.
4. `Branch`를 `main`으로 선택합니다.
5. 폴더는 `/root`를 선택합니다.
6. `Save`를 누릅니다.

잠시 기다리면 GitHub Pages 주소가 표시됩니다.

예:

```text
https://사용자명.github.io/quiz-mission/
```

참가자 화면:

```text
https://사용자명.github.io/quiz-mission/
```

관리자 화면:

```text
https://사용자명.github.io/quiz-mission/admin.html
```

## 4. 관리자 로그인

관리자 페이지 기본 비밀번호는 `1234`입니다.

비밀번호를 바꾸려면 `admin.js`의 아래 값을 수정한 뒤 다시 GitHub에 업로드하세요.

```js
const ADMIN_PASSWORD = "1234";
```

## 5. 문제 수정 후 반영

관리자 페이지에서 문제를 추가하거나 수정한 뒤 `questions.json 다운로드`를 누릅니다.

다운로드한 `questions.json`을 GitHub 저장소의 기존 `questions.json`과 교체하면 실제 사이트에 반영됩니다.

정적 사이트 특성상 관리자 페이지가 GitHub의 파일을 직접 덮어쓸 수는 없습니다. 반드시 다운로드한 파일을 저장소에 다시 업로드해야 합니다.

## 6. QR 링크 만들기

관리자 페이지의 `QR 관리` 탭으로 이동합니다.

`배포 주소` 칸에 GitHub Pages 주소를 직접 입력하세요.

예:

```text
https://사용자명.github.io/quiz-mission/
```

그러면 각 문제마다 이런 주소로 QR이 만들어집니다.

```text
https://사용자명.github.io/quiz-mission/index.html?q=snake
```

`배포 주소`를 비워두면 QR 링크는 상대경로로 생성됩니다.

```text
index.html?q=snake
```

실제 인쇄용 QR은 휴대폰 카메라가 바로 열 수 있도록 GitHub Pages 전체 주소를 입력한 뒤 만드는 것을 권장합니다.

## 7. QR 다운로드

각 문제 카드에서 다음 기능을 사용할 수 있습니다.

- `QR 생성`: 화면에서 QR 미리보기
- `QR 다운로드(PNG)`: 인쇄용 QR 이미지 저장
- `QR 복사`: 가능한 브라우저에서는 QR 이미지 복사, 제한되면 QR 링크 복사

## 8. 설문 결과 CSV

참가자가 설문을 제출하면 해당 기기의 브라우저에 결과가 저장됩니다.

관리자 페이지의 `설문 결과` 탭에서 `CSV 다운로드`를 누르면 CSV 파일을 받을 수 있습니다.

주의: GitHub Pages는 정적 호스팅이므로 여러 휴대폰의 설문 결과가 자동으로 한곳에 모이지 않습니다. 여러 기기로 운영했다면 각 기기에서 CSV를 내려받아 합쳐야 합니다.

## 9. 운영 전 점검

1. GitHub Pages 주소로 `index.html`이 열리는지 확인합니다.
2. `admin.html`에 접속해 로그인합니다.
3. `QR 관리`에서 GitHub Pages 주소를 입력합니다.
4. QR PNG를 다운로드합니다.
5. 휴대폰 카메라로 QR을 스캔해 문제 페이지가 열리는지 확인합니다.

이 과정을 한 번 통과하면 현장에서는 인쇄한 QR만 붙여 운영할 수 있습니다.
