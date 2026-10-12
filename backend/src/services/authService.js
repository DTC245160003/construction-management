const {
    verifyPassword: verifyArgon2id,
    hashPassword: hashArgon2id
} = require("../config/password");

const PUBLIC_REGISTRATION_ROLES = ["engineer", "worker", "viewer"];
const ROLE_ALIASES = {
    manager: "project_manager",
    employee: "worker"
};

function registrationError(status, message) {
    const error = new Error(message);
    error.status = status;
    error.expose = true;
    return error;
}

function createAuthService({
    userModel,
    verifyPassword = verifyArgon2id,
    hashPassword = hashArgon2id
}) {
    return {
        async register({ fullname, email, password, role, invitation_token } = {}) {
            if (
                typeof fullname !== "string"
                || !fullname.trim()
                || fullname.trim().length > 255
            ) {
                throw registrationError(400, "Họ và tên phải có từ 1 đến 255 ký tự");
            }

            if (
                typeof email !== "string"
                || email.trim().length > 255
                || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
            ) {
                throw registrationError(400, "Email không hợp lệ");
            }

            if (
                typeof password !== "string"
                || password.length < 8
                || Buffer.byteLength(password) > 1024
            ) {
                throw registrationError(400, "Mật khẩu phải có ít nhất 8 ký tự và tối đa 1024 byte");
            }

            role ??= "engineer";
            if (role === "user") role = "engineer";
            if (typeof role !== "string" || !role.trim()) {
                throw registrationError(400, "Vui lòng chọn vai trò");
            }

            role = role.trim();
            role = Object.hasOwn(ROLE_ALIASES, role) ? ROLE_ALIASES[role] : role;

            if (!PUBLIC_REGISTRATION_ROLES.includes(role)) {
                throw registrationError(403, "Vai trò này cần được quản trị viên cấp, không thể tự đăng ký");
            }

            email = email.trim().toLowerCase();

            if (await userModel.findByEmail(email)) {
                throw registrationError(409, "Email đã được sử dụng");
            }

            const selectedRole = await userModel.findRoleByName(role);
            if (!selectedRole) {
                throw registrationError(400, "Vai trò không tồn tại trong hệ thống");
            }

            const passwordHash = await hashPassword(password);

            try {
                const user = await userModel.createUser({
                    fullname: fullname.trim(),
                    email,
                    passwordHash,
                    roleId: selectedRole.id,
                    invitationToken: invitation_token
                });
                return { ...user, role: selectedRole.name,system_role:"user",is_active:true };
            } catch (error) {
                if (error.code === "23505") {
                    const conflict = registrationError(409, "Email đã được sử dụng");
                    conflict.cause = error;
                    throw conflict;
                }

                if (error.code === "23503") {
                    const missingRole = registrationError(400, "Vai trò không còn tồn tại trong hệ thống");
                    missingRole.cause = error;
                    throw missingRole;
                }

                throw error;
            }
        },

        async login(email, password) {
            if (
                typeof email !== "string"
                || !email.trim()
                || email.trim().length > 255
                || typeof password !== "string"
                || !password
                || Buffer.byteLength(password) > 1024
            ) {
                return null;
            }

            return userModel.withLockedUser(
                email.trim().toLowerCase(),
                async (user, changes) => {
                    // Unknown and locked accounts use the dummy hash.
                    const hash = user && !user.is_locked && user.is_active!==false ? user.password_hash : null;
                    const matches = await verifyPassword(hash, password);

                    if (!user) return null;
                    if (user.is_active===false) return null;

                    if (user.is_locked) {
                        return {
                            locked: true,
                            message: "Tài khoản đang bị khóa. Vui lòng thử lại sau 15 phút"
                        };
                    }

                    if (!matches) {
                        const previousAttempts = user.lock_expired
                            ? 0
                            : (user.failed_login_attempts || 0);
                        const attempts = Math.min(previousAttempts + 1, 5);

                        await changes.recordFailure(attempts);

                        // Return normally so the transaction commits the lock.
                        if (attempts >= 5) {
                            return {
                                locked: true,
                                message: "Tài khoản đã bị khóa 15 phút do nhập sai mật khẩu quá nhiều lần"
                            };
                        }

                        return null;
                    }

                    await changes.resetFailures();

                    return {
                        id: user.id,
                        fullname: user.fullname,
                        email: user.email,
                        role_id: user.role_id,
                        role: user.role,
                        system_role:user.system_role || "user",
                        is_active:user.is_active!==false
                    };
                }
            );
        }
    };
}

module.exports = { createAuthService };
