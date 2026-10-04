# Câu đố kinh điển

Bộ trò chơi trên web, mỗi trò là một bài toán nổi tiếng. Trang chủ (`/`) là menu chọn trò chơi.

| Trò chơi | Địa chỉ | Bài toán | Chạy ở đâu |
|---|---|---|---|
| Bài toán 12 đồng xu | `/coins` | Tìm đồng giả (nặng hoặc nhẹ hơn) trong 12 đồng bằng 3 lần cân | Server |
| Hai quả trứng, 100 tầng | `/eggs` | Tìm tầng cao nhất trứng không vỡ với 2 quả trứng và 14 lần thả | Server |
| Nim | `/nim` | Lần lượt bốc đồng xu với máy, ai bốc đồng cuối cùng thì thắng | Server |
| Qua cầu trong đêm | `/bridge` | Đưa 4 người qua cầu trong 17 phút với một chiếc đèn pin | Trang, server kiểm tra lại |
| Hai bình, một vòi nước | `/jugs` | Đong đúng 4 lít bằng bình 3 lít và bình 5 lít | Trang, server kiểm tra lại |
| Tháp Hà Nội | `/hanoi` | Chuyển chồng đĩa sang cọc khác với ít bước nhất | Trang, server kiểm tra lại |

- Người chơi phải nhập tên trước khi chơi. Kết quả mỗi ván được lưu lại, mỗi trò có bảng xếp hạng riêng.
- Ba trò đầu chạy trên server, nên người chơi không xem được đáp án trong mã nguồn trang. Ở chế độ khó, máy không chọn đáp án trước mà luôn trả lời theo hướng bất lợi nhất cho người chơi, nên chỉ cách làm đúng mới thắng.
- Ba trò sau chơi ngay trên trang. Khi xong, trang gửi các bước đi lên server; server đi lại từng bước theo cùng bộ luật (`rules.js`) rồi mới ghi kết quả.
- Có thể cài như một ứng dụng (PWA) trên Android, iPhone và máy tính.
- Không cần thư viện ngoài, chỉ cần Node.js 18 trở lên.

## Chạy trên máy

```bash
npm start
```

- Trên máy chạy server: mở `http://localhost:3000`.
- Người dùng chung mạng LAN: mở `http://<IP máy chạy server>:3000`. Server in sẵn địa chỉ này khi khởi động.
- Kết quả được lưu trong `data/results.csv` (mở được bằng Excel) và `data/results.jsonl`.

## Đưa lên Internet (Render)

1. Đăng nhập [render.com](https://render.com) bằng tài khoản GitHub.
2. Chọn **New → Blueprint**, chọn repo này. Render đọc file `render.yaml` và tạo:
   - Một web service gói **Starter** đặt ở Singapore.
   - Một ổ đĩa 1 GB gắn vào `/var/data` để giữ kết quả khi server khởi động lại hoặc deploy bản mới.
   - Biến `ADMIN_TOKEN` với giá trị ngẫu nhiên, dùng làm mật khẩu tải kết quả.
3. Đợi deploy xong, Render cấp địa chỉ dạng `https://impostor-coin.onrender.com`. Gửi địa chỉ này cho người chơi.
4. Từ đó, mỗi lần push lên nhánh `main`, Render tự deploy lại.

> Gói **Free** của Render không có ổ đĩa lưu trữ. Nếu dùng gói Free, toàn bộ kết quả sẽ mất mỗi khi server khởi động lại hoặc deploy, và server ngủ sau 15 phút không có ai truy cập.

### Tải kết quả về máy

Lấy giá trị `ADMIN_TOKEN` trong Render (**Environment** của service), rồi mở:

```
https://<địa-chỉ-của-bạn>/admin/results.csv?token=<ADMIN_TOKEN>
```

Đổi `results.csv` thành `results.jsonl` để tải bản đầy đủ. Không chia sẻ đường link có chứa token.

### Gắn tên miền riêng (không bắt buộc)

Trong Render, mở service → **Settings → Custom Domains** để thêm tên miền, rồi tạo bản ghi DNS theo hướng dẫn. Render tự cấp chứng chỉ HTTPS.

## Cài như ứng dụng

PWA chỉ cài được khi trang chạy qua HTTPS (hoặc `localhost`).

- **Android (Chrome):** bấm **Cài ứng dụng** ở góc trên trang, hoặc menu ⋮ → **Cài đặt ứng dụng**.
- **iPhone/iPad (Safari):** bấm **Chia sẻ** → **Thêm vào MH chính**.
- **Máy tính (Chrome, Edge):** bấm biểu tượng cài đặt trên thanh địa chỉ.

## Biến môi trường

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `PORT` | Cổng server lắng nghe | `3000` |
| `DATA_DIR` | Thư mục lưu kết quả | `./data` |
| `ADMIN_TOKEN` | Mật khẩu để tải kết quả qua `/admin/...`. Để trống thì tắt chức năng này | (trống) |
| `TRUST_PROXY` | Đặt `1` khi chạy sau proxy (Render, Railway, nginx) để ghi đúng IP người chơi | (tắt) |
| `TIME_ZONE` | Múi giờ của cột thời gian trong `results.csv` | `Asia/Ho_Chi_Minh` |

## Các file

| File | Vai trò |
|---|---|
| `index.html` | Menu chọn trò chơi |
| `games/<tên>.html` | Trang của từng trò, mở ở địa chỉ `/<tên>` |
| `games/<tên>.js` | Logic của từng trò trên server (không gửi cho trình duyệt) |
| `app.css`, `app.js` | Giao diện và mã dùng chung của mọi trang: nhập tên, gọi server, tab, bảng xếp hạng |
| `core.js` | Luật cân đồng xu, dùng chung cho trang và server |
| `rules.js` | Luật của Tháp Hà Nội, đong nước, qua cầu, dùng chung cho trang và server |
| `server.js` | Server: chạy ván chơi, lưu kết quả, bảng xếp hạng |
| `extras.js` | Các tab mở thêm của trò 12 đồng xu, server chỉ gửi cho người chơi đủ điều kiện |
| `sw.js`, `manifest.webmanifest`, `icons/` | Phần PWA |
| `render.yaml` | Cấu hình deploy lên Render |

## Thêm một trò chơi mới

1. Viết `games/<tên>.js`: logic trên server, gồm `label`, `modes`, `start`, `actions`, `abandon`, `star`, `steps`, `csv`. Xem `games/eggs.js` (trò chạy trên server) hoặc `games/hanoi.js` (trò chơi trên trang, server kiểm tra lại) làm mẫu.
2. Viết `games/<tên>.html`: trang trò chơi. Trang nạp `/app.js` rồi gọi `initPage({ game: '<tên>', ... })` để có sẵn ô nhập tên, tab và bảng xếp hạng.
3. Thêm `<tên>` vào `GAME_IDS` trong `server.js`, vào `GAME_LIST` trong `app.js` (danh sách “Trò chơi khác” ở cuối mỗi trang) và vào `SHELL` trong `sw.js` (nhớ đổi tên `CACHE`).
4. Thêm một thẻ `<a class="game">` vào menu trong `index.html`.

## Lưu ý khi nâng cấp từ bản chỉ có 12 đồng xu

- Kết quả cũ trong `results.jsonl` được giữ nguyên và tính cho trò 12 đồng xu.
- `results.csv` có thêm cột “Trò chơi”. Lần đầu chạy bản mới, server đổi tên file cũ thành `results-old.csv` rồi ghi lại `results.csv` từ `results.jsonl`.
- Trang chủ `/` giờ là menu; trò 12 đồng xu chuyển sang `/coins`.
