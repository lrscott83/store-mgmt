namespace Domain.Common.Constants
{
    public static class DataUtils
    {
        public static class SuperAdminUser
        {
            public static Guid Id = new Guid("38B96D85-BF75-41CA-BFD7-796E7FE0EBC8");
        }

        public static class SuperAdminRole
        {
            public static Guid Id = new Guid("04DE708A-BB0F-445D-AA82-34A973290A72");
        }

        public static class AdminUser
        {
            public static Guid Id = new Guid("EDE478C4-47CF-4640-9D00-FB98A0E85AC6");
        }

        public static class StoreAdminRole
        {
            public static Guid Id = new Guid("384CA85D-C12B-4DB4-BCCE-F8E0442657A8");
        }
        public static class DefaultStore
        {
            public static Guid Id = new Guid("0ED24A91-6748-4F04-8902-7981A0CA79E0");
            public static string Name = "Default Store";
        }

        public static class DefaultTenant
        {
            public static Guid Id = new Guid("B58BF718-C4ED-4EE9-A958-BB5A5DB4F7E8");
            public static string Name = "Default Tenant";
        }

        public static class DefaultOwner
        {
            public static Guid Id = new Guid("B58BF718-C4ED-4EE9-A958-BB5A5DB4F7E8");
            public static string Name = "Default Tenant";
        }
    }
}
