# Trại hè Ngôn ngữ và Nghệ thuật

Repository chứa các ứng dụng web phục vụ hoạt động **kiểm tra và luyện phát âm hai âm đầu L/N** trong chương trình Trại hè Ngôn ngữ và Nghệ thuật.

---

# 👩‍🏫 PHẦN 1 — DÀNH CHO TÌNH NGUYỆN VIÊN

> **Các bạn tình nguyện viên hãy truy cập link tương ứng với buổi học/ kiểm tra nhé.**

## 📝 Bài kiểm tra

Sử dụng đúng bài kiểm tra theo hướng dẫn của ban tổ chức.

### Bài test số 1

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/kiemtraphatamln-class-1/" target="_blank"><strong>MỞ BÀI TEST SỐ 1</strong></a>

### Bài test số 2

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/kiemtraphatamln-class-2/" target="_blank"><strong>MỞ BÀI TEST SỐ 2</strong></a>

---

## 🎤 Các bài luyện phát âm

Sử dụng đúng bài luyện tương ứng với buổi học.

### Bài luyện số 1

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-1/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 1</strong></a>

### Bài luyện số 2

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-2/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 2</strong></a>

### Bài luyện số 3

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-3/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 3</strong></a>

### Bài luyện số 4

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-4/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 4</strong></a>

### Bài luyện số 5

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-5/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 5</strong></a>

### Bài luyện số 6

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-6/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 6</strong></a>

### Bài luyện số 7

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-7/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 7</strong></a>

### Bài luyện số 8

👉 <a href="https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-8/" target="_blank"><strong>MỞ BÀI LUYỆN SỐ 8</strong></a>

---

# ⚙️ PHẦN 2 — DÀNH CHO ADMIN

> **Phần này dành cho người quản lý nội dung và cấu hình hệ thống.**
> Tình nguyện viên không cần thực hiện các thao tác trong phần này.

## Cấu trúc repository

Các bài kiểm tra và bài luyện được đặt trong các thư mục riêng:

```text
traihengonnguvanghethuat/
│
├── kiemtraphatamln-class-1/
├── kiemtraphatamln-class-2/
├── kiemtraphatamln.v2-template/
│
├── luyenphatamln-class-1/
├── luyenphatamln-class-2/
├── luyenphatamln-class-3/
├── luyenphatamln-class-4/
├── luyenphatamln-class-5/
├── luyenphatamln-class-6/
├── luyenphatamln-class-7/
├── luyenphatamln-class-8/
│
└── luyenphatamln.v2-template/
```

Mỗi thư mục là một web app độc lập, thông thường gồm:

```text
index.html
app.js
styles.css
config.json
l.png / L.png
n.png / N.png
```

### Chức năng của các file

* `index.html`: giao diện chính của ứng dụng.
* `app.js`: logic hoạt động của ứng dụng.
* `styles.css`: định dạng giao diện.
* `config.json`: nội dung và cấu hình riêng của từng bài.
* `l.png`, `n.png`: hình ảnh hỗ trợ phân biệt hai âm L/N.

---

## ✏️ Chỉnh sửa nội dung bài học

Trong trường hợp chỉ cần thay đổi **câu hỏi, câu luyện tập hoặc thời gian**, admin chủ yếu chỉ cần chỉnh file:

```text
config.json
```

Không nên sửa `app.js`, `index.html` hoặc `styles.css` nếu chỉ muốn thay đổi nội dung bài.

Ví dụ một item trong `config.json`:

```json
{
  "id": "thanh_nien",
  "text": "thanh niên",
  "time_limit_seconds": 40,
  "syllables": [
    {
      "text": "thanh",
      "target": null
    },
    {
      "text": "_iên",
      "target": "n"
    }
  ]
}
```

Trong đó:

* `id`: mã định danh của câu.
* `text`: nội dung đầy đủ hiển thị cho học sinh.
* `time_limit_seconds`: thời gian dành cho câu.
* `syllables`: cấu trúc các âm tiết trong câu.
* `target`: âm cần luyện, ví dụ `"l"` hoặc `"n"`. Nếu không phải âm cần kiểm tra thì để `null`.

Mỗi bài có `config.json` riêng, vì vậy có thể chỉnh nội dung một bài mà không ảnh hưởng đến các bài khác.

---

## ➕ Tạo bài mới

Repository có hai template:

* `kiemtraphatamln.v2-template`: template cho **bài kiểm tra**.
* `luyenphatamln.v2-template`: template cho **bài luyện**.

Ví dụ muốn tạo bài luyện số 9:

1. Copy thư mục `luyenphatamln.v2-template`.
2. Đổi tên thành:

```text
luyenphatamln-class-9
```

3. Chỉnh nội dung trong:

```text
luyenphatamln-class-9/config.json
```

4. Commit và push lên branch `main`.

Sau khi GitHub Pages cập nhật, bài mới sẽ có địa chỉ:

```text
https://edtech-vinuni.github.io/traihengonnguvanghethuat/luyenphatamln-class-9/
```

5. Thêm link của bài mới vào **PHẦN 1 — DÀNH CHO TÌNH NGUYỆN VIÊN** của README.

---

## 🌐 Repository

GitHub:

<a href="https://github.com/edtech-vinuni/traihengonnguvanghethuat" target="_blank">https://github.com/edtech-vinuni/traihengonnguvanghethuat</a>
