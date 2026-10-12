const INVALID_CREDENTIALS = "Thông tin đăng nhập không chính xác";

function createAuthController({ authService, cookieName, cookieOptions }) {
    return {
        async register(req, res) {
            const { fullname, email, password, role, invitation_token } = req.body || {};
            const user = await authService.register({
                fullname,
                email,
                password,
                role,
                invitation_token
            });

            return res.status(201).json({
                message: "Đăng ký tài khoản thành công",
                user
            });
        },

        async login(req, res) {
            const { email, password } = req.body || {};
            const user = await authService.login(email, password);

            if (user?.locked) {
                return res.status(423).json({ message: user.message });
            }

            if (!user) {
                return res.status(401).json({ message: INVALID_CREDENTIALS });
            }

            await new Promise((resolve, reject) => {
                req.session.regenerate(error => error ? reject(error) : resolve());
            });

            req.session.userId = user.id;

            try {
                await new Promise((resolve, reject) => {
                    req.session.save(error => error ? reject(error) : resolve());
                });
            } catch (error) {
                // Prevent an automatic retry from creating an authenticated session.
                const failedSession = req.session;
                delete req.session;
                res.clearCookie(cookieName, cookieOptions);

                try {
                    await new Promise((resolve, reject) => {
                        failedSession.destroy(cleanupError =>
                            cleanupError ? reject(cleanupError) : resolve()
                        );
                    });
                } catch (cleanupError) {
                    throw new AggregateError(
                        [error, cleanupError],
                        "Failed to clean up login session.",
                        { cause: cleanupError }
                    );
                }

                throw error;
            }

            return res.json({
                message: "Đăng nhập thành công",
                user
            });
        },

        async logout(req, res) {
            await new Promise((resolve, reject) => {
                req.session.destroy(error => error ? reject(error) : resolve());
            });

            res.clearCookie(cookieName, cookieOptions);
            return res.json({ message: "Đăng xuất thành công" });
        }
    };
}

module.exports = { createAuthController };
