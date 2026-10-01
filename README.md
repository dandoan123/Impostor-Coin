# Bài toán 12 đồng xu

Trò chơi trên web: có 12 đồng xu, một đồng giả nặng hơn hoặc nhẹ hơn. Người chơi đặt đồng xu lên cân hai đĩa, chỉ được cân 3 lần để tìm đồng giả và nói nó nặng hay nhẹ.

- Người chơi phải nhập tên trước khi chơi. Kết quả mỗi ván được lưu lại và hiện trên bảng xếp hạng.
- Mỗi ván chạy trên server, nên người chơi không xem được đồng giả trong mã nguồn trang.
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
| `index.html` | Giao diện trò chơi |
| `core.js` | Logic cân dùng chung cho trang và server |
| `server.js` | Server: chạy ván chơi, lưu kết quả, bảng xếp hạng |
| `extras.js` | Các tab mở thêm, server chỉ gửi cho người chơi đủ điều kiện |
| `sw.js`, `manifest.webmanifest`, `icons/` | Phần PWA |
| `render.yaml` | Cấu hình deploy lên Render |
